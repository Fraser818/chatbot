# 阿里云 Qwen 模型本地部署配置指南

## 前置条件

### 1. 获取阿里云 DashScope API Key

1. 访问阿里云 DashScope 控制台：**https://dashscope.console.aliyun.com/apiKey**
2. 登录阿里云账号（需要实名认证）
3. 开通 DashScope 服务
4. 点击「创建新的 API-KEY」
5. 复制生成的 Key（只显示一次，请妥善保存）

> 新用户有免费额度，详见：https://help.aliyun.com/zh/dashscope/pricing

### 2. 配置环境变量

在项目根目录创建 `.env.local` 文件：

```bash
# 必需：认证密钥（用于用户登录会话加密）
AUTH_SECRET=your_random_secret_here

# 必需：阿里云 DashScope API Key
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 可选：自定义 Base URL（默认使用阿里云官方接口，一般无需修改）
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

生成 AUTH_SECRET：
```bash
openssl rand -base64 32
```

### 3. 数据库配置（可选，用于持久化聊天记录）

```bash
# 本地 SQLite（开发测试用）
POSTGRES_URL=file:./chatbot.db

# 或使用 Neon/PostgreSQL
POSTGRES_URL=postgres://user:password@host:5432/dbname
```

## 模型配置说明

### 默认模型

| 场景 | 使用模型 | 说明 |
|------|---------|------|
| 主聊天 | `qwen-plus` | 性能均衡，适合日常对话 |
| 生成标题 | `qwen-turbo` | 快速生成会话标题 |
| 生成代码/工件 | `qwen-coder` | 代码和文本生成专用 |
| 推理模式 | `qwen-max` | 复杂问题深度推理 |

### 可用模型列表

| 模型 ID | 说明 | 适用场景 |
|--------|------|---------|
| `qwen-turbo` | 最快、最经济 | 简单任务、标题生成 |
| `qwen-plus` | 性能均衡 | 日常对话、通用任务 |
| `qwen-max` | 最强模型 | 复杂推理、高质量输出 |
| `qwen-coder` | 代码专用 | 代码生成、解释、调试 |
| `qwen-vl-max` | 视觉模型 | 图像理解、OCR |

## 启动项目

```bash
# 安装依赖
pnpm install

# 数据库迁移（首次运行）
pnpm db:migrate

# 启动开发服务器
pnpm dev
```

访问 **http://localhost:3000** 开始使用。

## 切换模型

在聊天界面右上角点击模型选择器，可以切换不同模型：

- Qwen Turbo
- Qwen Plus（默认）
- Qwen Max
- Qwen Coder
- Qwen Max Thinking（推理模式）

## 常见问题

### Q: 提示 "Invalid API Key"
A: 检查以下几点：
1. API Key 是否正确复制（包含 `sk-` 前缀）
2. 是否已完成实名认证
3. 账户是否有可用额度

### Q: 响应速度慢
A: 可以尝试切换到 `qwen-turbo` 模型，速度更快

### Q: 如何查看用量和余额？
A: 访问 https://dashscope.console.aliyun.com/overview

## 参考链接

- [阿里云 DashScope 文档](https://help.aliyun.com/zh/dashscope/)
- [通义千问模型介绍](https://help.aliyun.com/zh/dashscope/developer-reference/qwen-llm)
- [AI SDK 文档](https://ai-sdk.dev/docs)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
