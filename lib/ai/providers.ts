import { createAlibaba } from "@ai-sdk/alibaba";
import { gateway } from "@ai-sdk/gateway";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

// 创建阿里云实例（使用 OpenAI 兼容接口）
// 添加兼容性配置以处理多轮对话
let alibaba: ReturnType<typeof createAlibaba> | null = null;

function getAlibabaClient() {
  if (!alibaba && process.env.DASHSCOPE_API_KEY) {
    alibaba = createAlibaba({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
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
