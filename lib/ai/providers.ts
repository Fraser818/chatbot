import { createAlibaba } from "@ai-sdk/alibaba";
import { gateway } from "@ai-sdk/gateway";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

/**
 * 修复 Alibaba 兼容模式 API 的消息格式
 * 将所有消息的 content 转换为字符串格式
 */
function fixAlibabaMessages(messages: any[]) {
  return messages.map((msg) => {
    // 处理 null 或 undefined
    if (msg.content == null) {
      return { ...msg, content: "" };
    }

    // 处理数组格式：[{ type: "text", text: "..." }]
    if (Array.isArray(msg.content)) {
      const textContent = msg.content
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("");
      return { ...msg, content: textContent };
    }

    // 处理对象格式：{ type: "text", text: "..." }
    if (typeof msg.content === "object" && msg.content.type === "text" && typeof msg.content.text === "string") {
      return { ...msg, content: msg.content.text };
    }

    // 其他对象格式转为字符串
    if (typeof msg.content === "object") {
      return { ...msg, content: JSON.stringify(msg.content) };
    }

    // 已经是字符串，直接返回
    return msg;
  });
}

// 创建阿里云实例（使用 OpenAI 兼容接口）
let alibaba: ReturnType<typeof createAlibaba> | null = null;

function getAlibabaClient() {
  if (!alibaba && process.env.DASHSCOPE_API_KEY) {
    alibaba = createAlibaba({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      // 添加自定义 fetch 以修复消息格式
      fetch: async (url, options) => {
        if (options?.body) {
          const body = JSON.parse(options.body as string);
          // 修复消息格式
          if (body.messages) {
            const fixedMessages = fixAlibabaMessages(body.messages);
            body.messages = fixedMessages;
            options.body = JSON.stringify(body);
          }
        }
        const response = await globalThis.fetch(url, options);
        if (!response.ok) {
          const errorText = await response.text();
          console.error("[Alibaba Provider] Error response:", errorText);
          // 重新创建 response 以便错误处理
          return new Response(errorText, { status: response.status, headers: response.headers });
        }
        return response;
      },
    });
  }
  return alibaba;
}

// 兼容 Vercel AI Gateway 的模型 ID 映射
const MODEL_MAP: Record<string, string> = {
  "alibaba/qwen-turbo": "qwen-turbo",
  "alibaba/qwen-plus": "qwen-plus",
  "alibaba/qwen-max": "qwen-max",
  "alibaba/qwen-coder": "qwen-coder",
  "alibaba/qwen-vl-max": "qwen-vl-max",
  "alibaba/qwen-max-thinking": "qwen-max",
  "openai/gpt-4.1-mini": "qwen-plus",
  "google/gemini-2.5-flash-lite": "qwen-turbo",
  "anthropic/claude-haiku-4.5": "qwen-coder",
};

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // 本地环境：直接使用阿里云 Qwen
  const alibabaClient = getAlibabaClient();
  if (alibabaClient && process.env.DASHSCOPE_API_KEY) {
    const mappedModelId = MODEL_MAP[modelId] || modelId.replace("alibaba/", "");
    const isReasoningModel =
      modelId.endsWith("-thinking") ||
      (modelId.includes("reasoning") && !modelId.includes("non-reasoning"));

    if (isReasoningModel) {
      return wrapLanguageModel({
        model: alibabaClient.languageModel(mappedModelId),
        middleware: extractReasoningMiddleware({ tagName: "thinking" }),
      });
    }

    return alibabaClient.languageModel(mappedModelId);
  }

  // Vercel 环境：使用 AI Gateway
  const isReasoningModel =
    modelId.endsWith("-thinking") ||
    (modelId.includes("reasoning") && !modelId.includes("non-reasoning"));

  if (isReasoningModel) {
    const gatewayModelId = modelId.replace(THINKING_SUFFIX_REGEX, "");

    return wrapLanguageModel({
      model: gateway.languageModel(gatewayModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  // 本地环境：使用阿里云 Qwen
  const alibabaClient = getAlibabaClient();
  if (alibabaClient && process.env.DASHSCOPE_API_KEY) {
    return alibabaClient.languageModel("qwen-turbo");
  }

  // Vercel 环境：使用 AI Gateway
  return gateway.languageModel("alibaba/qwen-turbo");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }

  // 本地环境：使用阿里云 Qwen
  const alibabaClient = getAlibabaClient();
  if (alibabaClient && process.env.DASHSCOPE_API_KEY) {
    return alibabaClient.languageModel("qwen-coder");
  }

  // Vercel 环境：使用 AI Gateway
  return gateway.languageModel("alibaba/qwen-coder");
}
