import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { allowedModelIds } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { tumorQuotation } from "@/lib/ai/tools/tumor-quotation";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment, isDevelopmentEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;
  let modelMessages: any[] = []; // 用于错误日志

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const [botResult, session] = await Promise.all([checkBotId(), auth()]);

    if (botResult.isBot) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    if (!allowedModelIds.has(selectedChatModel)) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    await checkIpRateLimit(ipAddress(request));

    const userType: UserType = session.user.type;

    // 开发环境跳过限流检查
    if (!isDevelopmentEnvironment) {
      const messageCount = await getMessageCountByUserId({
        id: session.user.id,
        differenceInHours: 1,
      });

      if (messageCount > entitlementsByUserType[userType].maxMessagesPerHour) {
        return new ChatbotError("rate_limit:chat").toResponse();
      }
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({ id });
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const isReasoningModel =
      selectedChatModel.endsWith("-thinking") ||
      (selectedChatModel.includes("reasoning") &&
        !selectedChatModel.includes("non-reasoning"));

    // 检测是否使用阿里云 Qwen 模型
    const isAlibabaModel = selectedChatModel.startsWith("alibaba/");

    // 推理模型禁用工具调用
    const disableTools = isReasoningModel;

    // 使用完整的消息历史（包括 assistant 消息），这样 LLM 可以看到用户的确认信号
    // 注意：阿里云模型现在可以正确处理多轮对话了
    const messagesForModel = uiMessages;

    // [LOG] 记录转换前的 uiMessages
    console.log("[api/chat] uiMessages 数量:", messagesForModel.length);
    console.log("[api/chat] uiMessages 角色分布:", messagesForModel.map((m: any) => m.role).join(", "));

    let modelMessages = await convertToModelMessages(messagesForModel);

    // [LOG] 记录 convertToModelMessages 转换后的结果
    console.log("[api/chat] modelMessages 数量:", modelMessages.length);
    console.log("[api/chat] modelMessages 角色分布:", modelMessages.map((m: any) => m.role).join(", "));

    // [LOG] 检查每条消息的 content 字段
    modelMessages.forEach((msg: any, idx: number) => {
      console.log(`[api/chat] msg[${idx}] role=${msg.role}, hasContent=${!!msg.content}, content=`,
        typeof msg.content === 'string' ? `"${msg.content?.slice(0, 50)}"` :
        Array.isArray(msg.content) ? `array[${msg.content.length}]` : typeof msg.content);
      if (msg.parts) {
        console.log(`[api/chat] msg[${idx}] parts 数量:`, msg.parts.length);
      }
    });

    // 修复阿里云 Qwen API 的 content 字段要求
    // 阿里云 compatible-mode 端点要求每条消息必须有 content 字段（字符串格式）
    if (isAlibabaModel) {
      console.log("[api/chat] 检测到阿里云模型，开始修复 content 字段...");
      modelMessages = (modelMessages as any[]).map((msg: any, idx: number) => {
        // System messages don't need content field in the same way
        if (msg.role === "system") {
          console.log(`[api/chat] msg[${idx}] system 消息，跳过`);
          return msg;
        }

        // For tool messages, the content is an array of tool result parts
        // We need to ensure it's not empty
        if (msg.role === "tool") {
          // ToolModelMessage has content as an array, ensure it's not empty
          if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) {
            console.log(`[api/chat] msg[${idx}] 修复空 content 的 tool 消息`);
            return { ...msg, content: " " };
          }
          // 如果 content 是数组，转换为字符串
          if (Array.isArray(msg.content)) {
            const textContent = msg.content
              .map((item: any) => {
                if (typeof item === 'string') return item;
                if (item && typeof item.text === 'string') return item.text;
                if (item && item.type === 'text') return item.text || '';
                return JSON.stringify(item);
              })
              .join('');
            console.log(`[api/chat] msg[${idx}] tool 消息 content 数组转字符串`);
            return { ...msg, content: textContent || " " };
          }
          console.log(`[api/chat] msg[${idx}] tool 消息 content 正常`);
          return msg;
        }

        // For user and assistant messages, ensure content is a string
        if (Array.isArray(msg.content)) {
          // 数组格式：[{ type: 'text', text: '...' }, ...]
          const textContent = msg.content
            .map((item: any) => {
              if (typeof item === 'string') return item;
              if (item && typeof item.text === 'string') return item.text;
              if (item && item.type === 'text') return item.text || '';
              return '';
            })
            .join('');
          console.log(`[api/chat] msg[${idx}] 从 content 数组提取文本:`, textContent.slice(0, 30));
          return { ...msg, content: textContent || " " };
        }

        // For user and assistant messages, ensure content exists and is string
        if (!msg.content || msg.content === "") {
          // Try to extract text from parts if available
          if (msg.parts && Array.isArray(msg.parts)) {
            const textContent = msg.parts
              .filter((p: any) => p && p.type === "text")
              .map((p: any) => p.text || "")
              .join("");
            if (textContent) {
              console.log(`[api/chat] msg[${idx}] 从 parts 提取 content:`, textContent.slice(0, 30));
            }
            return { ...msg, content: textContent || " " };
          }
          console.log(`[api/chat] msg[${idx}] 使用默认 content 空格`);
          return { ...msg, content: " " };
        }

        console.log(`[api/chat] msg[${idx}] content 正常`);
        return msg;
      });

      // [LOG] 修复后再次检查
      console.log("[api/chat] 修复后 modelMessages 检查:");
      modelMessages.forEach((msg: any, idx: number) => {
        const contentInfo = typeof msg.content === 'string'
          ? `content="${msg.content.slice(0, 30)}${msg.content.length > 30 ? '...' : ''}"`
          : `content=${typeof msg.content}`;
        console.log(`[api/chat] fixed msg[${idx}] role=${msg.role}, ${contentInfo}`);
      });
    }

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: disableTools
            ? []
            : isReasoningModel
              ? []
              : [
                  "getWeather",
                  "createDocument",
                  "updateDocument",
                  "requestSuggestions",
                  "tumorQuotation",
                ],
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
            tumorQuotation: tumorQuotation({ session, dataStream, chatId: id }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(
          result.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          // ignore redis errors
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    // [LOG] 记录详细的错误信息
    console.error("[api/chat] 错误详情:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error && error.cause ? error.cause : undefined,
      vercelId,
    });

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    // [LOG] 特别记录 TypeValidationError 的详细信息
    if (error instanceof Error && error.name === "AI_TypeValidationError") {
      console.error("[api/chat] TypeValidationError 详细信息:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      });
      // 记录导致错误的请求体信息
      console.error("[api/chat] 最后发送的 modelMessages:", JSON.stringify(modelMessages, null, 2).slice(0, 2000));
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
