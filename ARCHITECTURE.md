# 项目架构文档

## 项目概述

这是一个基于 **Next.js 16** 的 AI 聊天机器人应用，使用 **Vercel AI SDK** 作为核心 AI 框架，支持多模型接入（阿里云 Qwen、Claude、GPT 等）。

**版本**: 3.1.0

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| **框架** | Next.js (App Router) | 16.0.10 |
| **语言** | TypeScript | 5.6.3 |
| **UI** | React | 19.0.1 |
| **AI SDK** | Vercel AI SDK | 6.0.37 |
| **AI Provider** | @ai-sdk/alibaba, @ai-sdk/gateway, @ai-sdk/openai | - |
| **数据库** | PostgreSQL + Drizzle ORM | 0.34.0 |
| **认证** | NextAuth.js | 5.0.0-beta.25 |
| **UI 组件** | Radix UI + shadcn/ui | - |
| **样式** | Tailwind CSS | 4.1.13 |
| **流式传输** | SSE (Server-Sent Events) | - |
| **限流** | Redis (可选) | - |
| **可观测性** | OpenTelemetry (@vercel/otel) | - |
| **Bot 保护** | BotID | 1.5.11 |

---

## 目录结构

```
chatbot/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 认证路由
│   │   ├── login/                # 登录页面
│   │   ├── register/             # 注册页面
│   │   ├── auth.config.ts        # Auth 配置
│   │   └── auth.ts               # Auth 逻辑
│   │
│   ├── (chat)/                   # 聊天功能
│   │   ├── api/
│   │   │   ├── chat/route.ts     # ★ 核心聊天 API
│   │   │   ├── history/          # 历史记录
│   │   │   ├── suggestions/      # 建议
│   │   │   └── uploads/          # 文件上传
│   │   ├── chat/[id]/
│   │   │   └── page.tsx          # 聊天详情页
│   │   └── page.tsx              # 新建聊天
│   │
│   ├── layout.tsx                # 根布局 (ThemeProvider, SessionProvider)
│   └── globals.css               # 全局样式
│
├── components/                   # React 组件
│   ├── ai-elements/              # AI 特定 UI 组件
│   ├── elements/                 # 聊天 UI 元素
│   ├── ui/                       # shadcn/ui primitives
│   ├── chat.tsx                  # ★ 聊天主组件
│   ├── messages.tsx              # 消息列表
│   ├── message.tsx               # 单条消息
│   ├── multimodal-input.tsx      # 输入框
│   ├── sidebar-history.tsx       # 历史侧边栏
│   └── chat-header.tsx           # 聊天头部
│
├── lib/                          # 核心逻辑
│   ├── ai/
│   │   ├── models.ts             # ★ 模型配置
│   │   ├── providers.ts          # ★ AI Provider 实例
│   │   ├── prompts.ts            # ★ 系统提示词
│   │   ├── entitlements.ts       # 用户权限
│   │   └── tools/
│   │       ├── create-document.ts    # 创建文档工具
│   │       ├── update-document.ts    # 更新文档工具
│   │       ├── request-suggestions.ts # 请求建议工具
│   │       └── get-weather.ts        # 天气查询工具
│   │
│   ├── db/
│   │   ├── schema.ts             # ★ 数据库表结构
│   │   ├── queries.ts            # ★ 数据库查询
│   │   ├── migrate.ts            # 数据库迁移
│   │   └── schema.ts             # Drizzle schema
│   │
│   ├── artifacts/
│   │   ├── server.ts             # ★ 文档处理器
│   │   ├── text/                 # 文本文档
│   │   ├── code/                 # 代码文档
│   │   └── sheet/                # 表格文档
│   │
│   ├── editor/                   # ProseMirror 编辑器
│   ├── types.ts                  # TypeScript 类型
│   ├── utils.ts                  # 工具函数
│   ├── constants.ts              # 常量
│   ├── errors.ts                 # 错误定义
│   └── ratelimit.ts              # 限流逻辑
│
├── hooks/                        # Custom React Hooks
│   ├── use-artifact.ts
│   ├── use-chat-visibility.ts
│   ├── use-messages.ts
│   └── use-auto-resume.ts
│
├── artifacts/                    # Artifact 类型实现
│   ├── text/
│   ├── code/
│   └── sheet/
│
├── tests/                        # Playwright E2E 测试
├── public/                       # 静态资源
└── instrumentation.ts            # OpenTelemetry 埋点
```

---

## 数据库 Schema

```
┌─────────────────────────────────────────────────────────────┐
│                         User                                │
├─────────────────────────────────────────────────────────────┤
│ id: uuid (PK)                                               │
│ email: varchar(64)                                          │
│ password: varchar(64)                                       │
│ type: "guest" | "regular"                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ userId
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         Chat                                │
├─────────────────────────────────────────────────────────────┤
│ id: uuid (PK)                                               │
│ createdAt: timestamp                                        │
│ title: text                                                 │
│ userId: uuid (FK → User.id)                                 │
│ visibility: "public" | "private"                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ chatId
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   Message_v2     │ │     Vote_v2      │ │     Stream       │
├──────────────────┤ ├──────────────────┤ ├──────────────────┤
│ id: uuid (PK)    │ │ chatId: uuid    │ │ id: uuid (PK)    │
│ chatId: uuid     │ │ messageId: uuid │ │ chatId: uuid     │
│ role: varchar    │ │ isUpvoted: bool │ │ createdAt: ts    │
│ parts: json      │ │ (PK: chatId,    │ └──────────────────┘
│ attachments: json│ │      messageId) │
│ createdAt: ts    │ └──────────────────┘
└──────────────────┘
                              │
                              │ chatId
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Document                              │
├─────────────────────────────────────────────────────────────┤
│ id: uuid (PK, with createdAt)                               │
│ createdAt: timestamp                                        │
│ title: text                                                 │
│ content: text                                               │
│ kind: "text" | "code" | "image" | "sheet"                   │
│ userId: uuid (FK → User.id)                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ documentId, documentCreatedAt
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Suggestion                             │
├─────────────────────────────────────────────────────────────┤
│ id: uuid (PK)                                               │
│ documentId: uuid (FK)                                       │
│ documentCreatedAt: timestamp (FK)                           │
│ originalText: text                                          │
│ suggestedText: text                                         │
│ description: text                                           │
│ isResolved: boolean                                         │
│ userId: uuid (FK → User.id)                                 │
│ createdAt: timestamp                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 对话的前后端完整链路

### 时序图

```
┌─────┐              ┌─────────────┐              ┌───────────┐              ┌─────┐
│用户 │              │  Frontend   │              │  Backend  │              │ LLM │
└──┬──┘              └──────┬──────┘              └─────┬─────┘              └──┬──┘
   │                        │                           │                       │
   │ 1.输入消息，点击发送    │                           │                       │
   │───────────────────────>│                           │                       │
   │                        │                           │                       │
   │                        │ 2. POST /api/chat         │                       │
   │                        │    { id, message,         │                       │
   │                        │      selectedChatModel }  │                       │
   │                        │──────────────────────────>│                       │
   │                        │                           │                       │
   │                        │ 3. 请求处理流程：         │                       │
   │                        │    a. 解析请求体          │                       │
   │                        │    b. Bot 检测 (checkBotId)│                       │
   │                        │    c. 用户认证 (auth)      │                       │
   │                        │    d. 模型验证            │                       │
   │                        │    e. IP 限流检查          │                       │
   │                        │    f. 用户消息限流        │                       │
   │                        │                           │                       │
   │                        │ 4. 获取/创建 Chat 会话      │                       │
   │                        │ 5. 保存用户消息到 DB       │                       │
   │                        │─────────┐                 │                       │
   │                        │         │ (异步)           │                       │
   │                        │<────────┘                 │                       │
   │                        │                           │                       │
   │                        │ 6. 构建 messages 数组      │                       │
   │                        │    convertToModelMessages()│                       │
   │                        │                           │                       │
   │                        │ 7. streamText()           │                       │
   │                        │    - model: LLM           │                       │
   │                        │    - system: prompt       │                       │
   │                        │    - tools: [...]         │                       │
   │                        │──────────────────────────>│ 8. 调用 LLM API       │
   │                        │                           │──────────────────────>│
   │                        │                           │                       │
   │                        │ 9. SSE 流式响应            │                       │
   │                        │    (token by token)       │                       │
   │                        │<──────────────────────────│                       │
   │                        │                           │                       │
   │ 10. 实时渲染消息       │                           │                       │
   │<───────────────────────│                           │                       │
   │                        │                           │                       │
   │                        │ 11. onFinish:             │                       │
   │                        │     保存 AI 响应到 DB        │                       │
   │                        │─────────┐                 │                       │
   │                        │         │ (异步)           │                       │
   │                        │<────────┘                 │                       │
   │                        │                           │                       │
```

---

### 详细流程

#### 1. 前端：发起对话

**文件**: `components/chat.tsx`

```tsx
// useChat hook 管理消息状态
const {
  messages,
  setMessages,
  sendMessage,
  status,
  regenerate,
} = useChat<ChatMessage>({
  id,
  messages: initialMessages,
  transport: new DefaultChatTransport({
    api: "/api/chat",
    fetch: fetchWithErrorHandlers,
  }),
  onError: (error) => { /* 错误处理 */ },
  onFinish: () => { /* 完成回调 */ },
});

// 用户发送消息
sendMessage({
  role: "user",
  parts: [{ type: "text", text: input }],
});
```

#### 2. 后端：API 路由处理

**文件**: `app/(chat)/api/chat/route.ts`

```typescript
export async function POST(request: Request) {
  // 1. 解析请求
  const requestBody = postRequestBodySchema.parse(await request.json());
  const { id, message, selectedChatModel } = requestBody;

  // 2. Bot 检测
  const botResult = await checkBotId();
  if (botResult.isBot) return error;

  // 3. 用户认证
  const session = await auth();
  if (!session?.user) return error;

  // 4. 模型验证
  if (!allowedModelIds.has(selectedChatModel)) return error;

  // 5. 限流检查
  await checkIpRateLimit(ipAddress(request));
  const messageCount = await getMessageCountByUserId({ id: session.user.id });
  if (messageCount > maxMessagesPerHour) return error;

  // 6. 获取/创建会话
  const chat = await getChatById({ id });
  if (!chat) {
    await saveChat({ id, userId: session.user.id, title: "New chat" });
  }

  // 7. 保存用户消息
  await saveMessages({
    messages: [{
      chatId: id,
      id: message.id,
      role: "user",
      parts: message.parts,
      createdAt: new Date(),
    }],
  });

  // 8. 调用 LLM
  const stream = streamText({
    model: getLanguageModel(selectedChatModel),
    system: systemPrompt({ selectedChatModel, requestHints }),
    messages: await convertToModelMessages(uiMessages),
    tools: {
      getWeather,
      createDocument: createDocument({ session, dataStream }),
      updateDocument: updateDocument({ session, dataStream }),
      requestSuggestions: requestSuggestions({ session, dataStream }),
    },
  });

  // 9. 流式输出
  return createUIMessageStreamResponse({ stream });
}
```

#### 3. AI Provider

**文件**: `lib/ai/providers.ts`

```typescript
// 本地环境：直连阿里云 DashScope
// Vercel 环境：使用 AI Gateway
export function getLanguageModel(modelId: string) {
  if (process.env.DASHSCOPE_API_KEY) {
    const alibaba = createAlibaba({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    return alibaba.languageModel(MODEL_MAP[modelId]);
  }

  // Vercel AI Gateway
  return gateway.languageModel(modelId);
}
```

#### 4. 工具调用 (Tool Calling)

**文件**: `lib/ai/tools/create-document.ts`

```typescript
export const createDocument = ({ session, dataStream }) =>
  tool({
    description: "创建文档",
    inputSchema: z.object({
      title: z.string(),
      kind: z.enum(["text", "code", "sheet"]),
    }),
    execute: async ({ title, kind }) => {
      const id = generateUUID();

      // 发送元数据到前端
      dataStream.write({ type: "data-id", data: id });
      dataStream.write({ type: "data-title", data: title });
      dataStream.write({ type: "data-kind", data: kind });

      // 生成内容
      await documentHandler.onCreateDocument({ id, title, dataStream, session });

      return { id, title, kind, content: "文档已创建" };
    },
  });
```

---

## 支持的 AI 模型

**配置**: `lib/ai/models.ts`

### 阿里云 Qwen (默认)
| 模型 ID | 名称 | 描述 |
|--------|------|------|
| `alibaba/qwen-turbo` | Qwen Turbo | 快速且经济实惠 |
| `alibaba/qwen-plus` | Qwen Plus | 性能均衡，适合日常任务 |
| `alibaba/qwen-max` | Qwen Max | 最强 Qwen 模型 |
| `alibaba/qwen-coder` | Qwen Coder | 代码生成专用 |
| `alibaba/qwen-vl-max` | Qwen VL Max | 视觉理解模型 |
| `alibaba/qwen-max-thinking` | Qwen Max Thinking | 推理模型 |

### 其他模型
- **Anthropic**: Claude Haiku 4.5, Claude 3.7 Sonnet Thinking
- **OpenAI**: GPT-4.1 Mini, GPT-5 Mini
- **Google**: Gemini 2.5 Flash Lite, Gemini 3 Pro
- **xAI**: Grok 4.1 Fast, Grok Code Fast

---

## 系统提示词

**文件**: `lib/ai/prompts.ts`

```typescript
const regularPrompt = `
You are a friendly assistant! Keep your responses concise and helpful.
When asked to write, create, or help with something, just do it directly.
`;

const artifactsPrompt = `
Artifacts is a special user interface mode that helps users with writing, editing, and other content creation tasks.

When asked to write code, always use artifacts.
When writing code, specify the language in the backticks, e.g. \`\`\`python\`code here\`\`\`.
The default language is Python.

DO NOT UPDATE DOCUMENTS IMMEDIATELY AFTER CREATING THEM.
WAIT FOR USER FEEDBACK OR REQUEST TO UPDATE IT.
`;

// 推理模型不使用 artifactsPrompt
// 普通模型：regularPrompt + artifactsPrompt
// 推理模型：regularPrompt only
```

---

## 限流策略

### IP 限流
- 基于 IP 地址限流
- 需要配置 Redis (`REDIS_URL`)

### 用户限流
```typescript
// entitlementsByUserType
const entitlements = {
  guest: { maxMessagesPerHour: 10 },
  regular: { maxMessagesPerHour: 100 },
};
```

---

## 环境变量

```bash
# 阿里云 DashScope (本地开发)
DASHSCOPE_API_KEY=your_api_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Vercel AI Gateway (生产环境)
AI_GATEWAY_API_KEY=your_api_key

# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/chatbot

# Redis (限流)
REDIS_URL=redis://localhost:6379

# Auth
AUTH_SECRET=your_auth_secret
```

---

## 关键设计决策

### 1. 阿里云兼容性处理
针对阿里云 Qwen 模型的兼容性问题，做了特殊处理：
- 仅使用 user 消息，不使用历史 assistant 消息
- 禁用工具调用（某些模型不支持）

```typescript
// route.ts:160-164
const isAlibabaModel = selectedChatModel.startsWith("alibaba/");
const disableTools = isAlibabaModel;

const messagesForModel = isAlibabaModel
  ? uiMessages.filter((m) => m.role === "user")
  : uiMessages;
```

### 2. 推理模型支持
通过 `-thinking` 后缀识别推理模型，使用 `extractReasoningMiddleware` 处理推理过程输出。

### 3. 流式恢复
使用 `resumable-stream` 库支持断线重连，需要配置 Redis。

### 4. 双模式部署
| 环境 | AI Provider |
|------|-------------|
| 本地开发 | 阿里云 DashScope (直连) |
| Vercel 生产 | AI Gateway |

---

## 运行命令

```bash
# 开发
pnpm dev

# 构建
pnpm build

# 数据库迁移
pnpm db:migrate

# 数据库管理
pnpm db:studio
pnpm db:push
pnpm db:pull

# 测试
pnpm test

# 代码格式化
pnpm lint
pnpm format
```
