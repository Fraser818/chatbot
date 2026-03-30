/**
 * Tumor Quotation Tool - 肿瘤模型报价工具
 *
 * 基于 Wilkins src/lib/agents/tumor/quotation.ts 迁移
 * 实现两阶段报价流程：
 *
 * 阶段一（确认阶段）：
 * - LLM 根据 System Prompt 自主决策，提取关键信息并请求确认
 * - 检测用户确认信号
 *
 * 阶段二（报价阶段）：
 * - 用户确认后，执行完整报价流程：价格提取 → Markdown → Word 文档
 */

import { tool, type UIMessageStreamWriter } from "ai"
import type { Session } from "next-auth"
import { z } from "zod"
import {
  extractPriceData,
  generateMarkdownQuotation,
  extractTemplateVars,
  buildDocxData,
  generateWordQuote,
} from "@/lib/agents/tumor/workflow"
import { getModelTypeFromRoute } from "@/lib/agents/tumor/utils"
import type { ChatMessage } from "@/lib/types"
import { generateId } from "ai"

type TumorQuotationProps = {
  session: Session
  dataStream: UIMessageStreamWriter<ChatMessage>
  chatId: string
}

/**
 * TumorQuotation Tool - 肿瘤模型报价工具
 */
export const tumorQuotation = ({ session, dataStream, chatId }: TumorQuotationProps) =>
  tool({
    description: `Generate a quotation for tumor xenograft models (CDX, PDX, syngeneic, humanized models).

【强制确认流程 - 核心原则】
- 首次接收用户需求时，即使信息看似完整，也绝对不能直接生成报价
- 必须先提取关键信息并向用户展示，请求确认
- 只有在用户明确表示"确认"、"正确"、"无误"、"可以"等肯定回复后，才能生成报价

【关键信息要素（必须全部提取并确认）】
1. 模型分类：CDX / PDX / Syngeneic / Humanized
2. 动物品系：BALB/c nude / C57BL/6 / NPG / NCG 等
3. 接种方式：subQ（皮下）/ systemic（系统）/ orthotopic（原位）
4. 动物总数量：根据分组计算得出

【价目表参考（RMB）】
| 模型分类    | 动物品系    | 皮下接种 | 腹腔/静脉 | 原位/转移 |
|------------|------------|---------|----------|----------|
| CDX        | BALB/c nude | 1650    | 1650     | 3500     |
| CDX        | NPG/NCG     | 1800    | 1800     | 3800     |
| Syngeneic  | C57BL/6     | 1650    | 1650     | 3500     |

【禁止行为】
- 在单轮对话内完成"信息提取→直接报价"的跳跃
- 用户首次提供信息时就调用此工具
- 没有用户明确确认信号就生成报价

【语言要求】
- 无论用户使用何种语言输入，始终使用**简体中文**进行回复`,

    inputSchema: z.object({
      userQuery: z.string().describe("The user request or question"),
      chatHistory: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })
        )
        .describe("Chat history for context"),
      fileIds: z.array(z.string()).optional().describe("File IDs for uploaded documents"),
    }),

    execute: async ({ userQuery, chatHistory, fileIds }) => {
      console.log("[TumorQuotation] Tool 被调用，userQuery:", userQuery.slice(0, 50))

      const historyText = chatHistory.map((msg) => `${msg.role}: ${msg.content}`).join("\n")

      // 阶段一：提取价格数据
      const priceData = await extractPriceData(userQuery, historyText)

      if (!priceData) {
        return {
          success: false,
          message: "无法从对话中提取足够的报价信息，请提供更详细的实验参数。",
        }
      }

      const hasValidPrice = priceData.unitPriceRMB > 0 || priceData.unitPriceUSD > 0
      if (!hasValidPrice) {
        return {
          success: false,
          message: "未识别到有效的价格信息，请检查动物品系和接种方式。",
        }
      }

      // 阶段二：生成 Markdown 报价单（流式输出）
      const { mdContent, textStream } = await generateMarkdownQuotation(
        userQuery,
        historyText,
        priceData
      )

      // 使用同一个 ID 发送完整的文本块
      const textId = generateId()
      dataStream.write({
        type: "text-start",
        id: textId,
      })

      for await (const chunk of textStream) {
        dataStream.write({
          type: "text-delta",
          delta: chunk,
          id: textId,
        })
      }

      dataStream.write({
        type: "text-end",
        id: textId,
      })

      // 阶段三：生成 Word 文档
      const languages = [
        { code: "RMB" as const, name: "中文", currency: "RMB", price: priceData.unitPriceRMB },
        { code: "USD" as const, name: "英文", currency: "USD", price: priceData.unitPriceUSD },
      ].filter((lang) => lang.price > 0)

      const wordFiles: { fileName: string; url: string }[] = []
      for (const lang of languages) {
        // 每个文本块使用独立的 ID
        const blockId = generateId()
        dataStream.write({
          type: "text-start",
          id: blockId,
        })
        dataStream.write({
          type: "text-delta",
          delta: `\n\n🔄 正在生成 ${lang.name}报价单 (${lang.currency})... `,
          id: blockId,
        })
        dataStream.write({
          type: "text-end",
          id: blockId,
        })

        try {
          // 提取模板变量
          const vars = await extractTemplateVars(userQuery, historyText, historyText)

          // 组装数据
          const modelType = getModelTypeFromRoute(priceData.route)
          const docxData = buildDocxData(vars, modelType)

          // 生成 Word
          const wordFile = await generateWordQuote(docxData, lang.code, modelType, session.user.id)

          const fileUrl = `/api/files/${wordFile.fileId}`
          wordFiles.push({ fileName: wordFile.fileName, url: fileUrl })

          // 发送 Word 文档下载链接（使用自定义数据事件）
          dataStream.write({
            type: "data-word-file",
            data: {
              id: wordFile.fileId,
              url: fileUrl,
              name: wordFile.fileName,
              language: lang.name,
            },
          } as any)

          // 使用同一个 ID 发送完整的文本块
          const successId = generateId()
          dataStream.write({
            type: "text-start",
            id: successId,
          })
          dataStream.write({
            type: "text-delta",
            delta: `\n✅ ${lang.name}报价单生成完成：[${wordFile.fileName}](${fileUrl})`,
            id: successId,
          })
          dataStream.write({
            type: "text-end",
            id: successId,
          })
        } catch (error) {
          // 使用同一个 ID 发送错误的文本块
          const errorId = generateId()
          dataStream.write({
            type: "text-start",
            id: errorId,
          })
          dataStream.write({
            type: "text-delta",
            delta: `\n❌ ${lang.name}报价单生成失败：${error}`,
            id: errorId,
          })
          dataStream.write({
            type: "text-end",
            id: errorId,
          })
        }
      }

      return {
        success: true,
        message: "Quotation generated successfully.",
        priceData,
        wordFiles,
      }
    },
  })
