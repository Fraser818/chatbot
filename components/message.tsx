"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useState } from "react";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./elements/tool";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { Weather } from "./weather";
import { WordPreviewDrawer } from "./word-preview-drawer";

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [wordPreviewOpen, setWordPreviewOpen] = useState(false);
  const [wordPreviewFile, setWordPreviewFile] = useState<{ fileName: string; url: string; language?: string } | null>(null);

  const handleOpenWordPreview = (file: { fileName: string; url: string; language?: string }) => {
    setWordPreviewFile(file);
    setWordPreviewOpen(true);
  };

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  return (
    <div
      className="group/message fade-in w-full animate-in duration-200"
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn("flex w-full items-start gap-2 md:gap-3", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
        })}
      >
        {message.role === "assistant" && (
          <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div
          className={cn("flex flex-col", {
            "gap-2 md:gap-4": message.parts?.some(
              (p) => p.type === "text" && p.text?.trim()
            ),
            "w-full":
              (message.role === "assistant" &&
                (message.parts?.some(
                  (p) => p.type === "text" && p.text?.trim()
                ) ||
                  message.parts?.some((p) => p.type.startsWith("tool-")))) ||
              mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex flex-row justify-end gap-2"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  attachment={{
                    name: attachment.filename ?? "file",
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                  key={attachment.url}
                />
              ))}
            </div>
          )}

          {/* 第一阶段：渲染 reasoning 和 text 消息（不包括 tool-tumorQuotation） */}
          {message.parts?.map((part, index) => {
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            // 处理 tool-tumorQuotation 的输入流状态（显示"正在生成报价..."）
            if (type === "tool-tumorQuotation") {
              const state = (part as { state?: string }).state;

              // 在输入流式传输期间显示加载状态
              if (state === "input-streaming" || state === "input-requesting") {
                return (
                  <div key={key} className="flex items-center gap-2 text-muted-foreground text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                    <span>正在生成报价单...</span>
                  </div>
                );
              }

              // 输入已准备好但工具还未执行
              if (state === "input-available") {
                return (
                  <div key={key} className="flex items-center gap-2 text-muted-foreground text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                    <span>正在处理报价信息...</span>
                  </div>
                );
              }

              // 工具执行完成，跳过（在第二阶段渲染）
              if (state === "output-available") {
                return null;
              }
            }

            // 跳过 tool-tumorQuotation，稍后在底部渲染
            if (type === "tool-tumorQuotation") {
              return null;
            }

            if (type === "reasoning") {
              const hasContent = part.text?.trim().length > 0;
              if (hasContent) {
                const isStreaming =
                  "state" in part && part.state === "streaming";
                return (
                  <MessageReasoning
                    isLoading={isLoading || isStreaming}
                    key={key}
                    reasoning={part.text}
                  />
                );
              }
            }

            if (type === "text") {
              if (mode === "view") {
                // 检查是否是报价单的 text 部分（同消息中有 tool-tumorQuotation）
                const hasTumorQuotation = message.parts?.some(
                  (p) => p.type === "tool-tumorQuotation"
                );

                return (
                  <div key={key} className={cn(
                    "w-full max-w-none",
                    hasTumorQuotation && "max-w-[700px]"
                  )}>
                    <MessageContent
                      className={cn({
                        "wrap-break-word w-fit rounded-2xl px-3 py-2 text-right text-white":
                          message.role === "user",
                        "bg-transparent px-0 py-0 text-left":
                          message.role === "assistant",
                      })}
                      data-testid="message-content"
                      style={
                        message.role === "user"
                          ? { backgroundColor: "#006cff" }
                          : undefined
                      }
                    >
                      <Response className={cn(
                        hasTumorQuotation && "prose-quoteless",
                        "[&_table]:w-full [&_table]:max-w-full",
                        "[&_table_th]:bg-blue-50 [&_table_th]:text-blue-900 [&_table_th]:font-semibold",
                        "[&_table_td]:border [&_table_td]:border-gray-200 [&_table_td]:px-3 [&_table_td]:py-2",
                        "[&_table_tr]:border-b [&_table_tr]:border-gray-200",
                        "[&_table]:my-2"
                      )}>{sanitizeText(part.text)}</Response>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        regenerate={regenerate}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (type === "tool-getWeather") {
              const { toolCallId, state } = part;
              const approvalId = (part as { approval?: { id: string } })
                .approval?.id;
              const isDenied =
                state === "output-denied" ||
                (state === "approval-responded" &&
                  (part as { approval?: { approved?: boolean } }).approval
                    ?.approved === false);
              const widthClass = "w-[min(100%,450px)]";

              if (state === "output-available") {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Weather weatherAtLocation={part.output} />
                  </div>
                );
              }

              if (isDenied) {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Tool className="w-full" defaultOpen={true}>
                      <ToolHeader
                        state="output-denied"
                        type="tool-getWeather"
                      />
                      <ToolContent>
                        <div className="px-4 py-3 text-muted-foreground text-sm">
                          Weather lookup was denied.
                        </div>
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              if (state === "approval-responded") {
                return (
                  <div className={widthClass} key={toolCallId}>
                    <Tool className="w-full" defaultOpen={true}>
                      <ToolHeader state={state} type="tool-getWeather" />
                      <ToolContent>
                        <ToolInput input={part.input} />
                      </ToolContent>
                    </Tool>
                  </div>
                );
              }

              return (
                <div className={widthClass} key={toolCallId}>
                  <Tool className="w-full" defaultOpen={true}>
                    <ToolHeader state={state} type="tool-getWeather" />
                    <ToolContent>
                      {(state === "input-available" ||
                        state === "approval-requested") && (
                          <ToolInput input={part.input} />
                        )}
                      {state === "approval-requested" && approvalId && (
                        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                          <button
                            className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => {
                              addToolApprovalResponse({
                                id: approvalId,
                                approved: false,
                                reason: "User denied weather lookup",
                              });
                            }}
                            type="button"
                          >
                            Deny
                          </button>
                          <button
                            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90"
                            onClick={() => {
                              addToolApprovalResponse({
                                id: approvalId,
                                approved: true,
                              });
                            }}
                            type="button"
                          >
                            Allow
                          </button>
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                </div>
              );
            }

            if (type === "tool-createDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error creating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <DocumentPreview
                  isReadonly={isReadonly}
                  key={toolCallId}
                  result={part.output}
                />
              );
            }

            if (type === "tool-updateDocument") {
              const { toolCallId } = part;

              if (part.output && "error" in part.output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error updating document: {String(part.output.error)}
                  </div>
                );
              }

              return (
                <div className="relative" key={toolCallId}>
                  <DocumentPreview
                    args={{ ...part.output, isUpdate: true }}
                    isReadonly={isReadonly}
                    result={part.output}
                  />
                </div>
              );
            }

            if (type === "tool-requestSuggestions") {
              const { toolCallId, state } = part;

              return (
                <Tool defaultOpen={true} key={toolCallId}>
                  <ToolHeader state={state} type="tool-requestSuggestions" />
                  <ToolContent>
                    {state === "input-available" && (
                      <ToolInput input={part.input} />
                    )}
                    {state === "output-available" && (
                      <ToolOutput
                        errorText={undefined}
                        output={
                          "error" in part.output ? (
                            <div className="rounded border p-2 text-red-500">
                              Error: {String(part.output.error)}
                            </div>
                          ) : (
                            <DocumentToolResult
                              isReadonly={isReadonly}
                              result={part.output}
                              type="request-suggestions"
                            />
                          )
                        }
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            return null;
          })}

          {/* 第二阶段：渲染 tool-tumorQuotation 文件链接（在底部） */}
          {message.parts?.map((part, index) => {
            if (part.type === "tool-tumorQuotation") {
              const { toolCallId, state } = part;

              if (state === "output-available") {
                const output = part.output;

                // 渲染 Word 文件下载链接（带预览功能）
                if (output && "wordFiles" in output && Array.isArray(output.wordFiles)) {
                  return (
                    <div className="flex flex-col gap-2" key={`wordfile-${toolCallId}`}>
                      <div className="text-sm text-muted-foreground mb-1">报价单已生成，点击下方文件预览或下载：</div>
                      {output.wordFiles.map((file: { fileName: string; url: string; language?: string }, index: number) => (
                        <button
                          key={index}
                          onClick={() => handleOpenWordPreview(file)}
                          className="group inline-flex w-fit max-w-md items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-left text-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600 group-hover:bg-blue-200">
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v5a1 1 0 0 0 1 1h5v10H6z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-blue-900 truncate">{file.fileName}</div>
                            <div className="text-xs text-blue-600">{file.language || "Word 文档"}</div>
                          </div>
                          <div className="flex items-center gap-1 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span className="text-xs font-medium">预览</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                }

                // 渲染错误消息
                if (output && "success" in output && output.success === false) {
                  return (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500" key={toolCallId}>
                      {String(output.message)}
                    </div>
                  );
                }
              }

              return null;
            }

            return null;
          })}

          {/* Word 预览抽屉 */}
          <WordPreviewDrawer
            open={wordPreviewOpen}
            onClose={() => {
              setWordPreviewOpen(false);
              setWordPreviewFile(null);
            }}
            file={wordPreviewFile}
          />

          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => {
  return (
    <div
      className="group/message fade-in w-full animate-in duration-300"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-start justify-start gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <div className="animate-pulse">
            <SparklesIcon size={14} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="flex items-center gap-1 p-0 text-muted-foreground text-sm">
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
