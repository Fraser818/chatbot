/**
 * Tumor Quotation 工作流
 * 从 Wilkins src/lib/agents/tumor/quotation.ts 迁移核心函数
 */

import { streamText } from 'ai'
import { getLanguageModel } from '@/lib/ai/providers'
import { SELECT_PROMPT_BOTH } from '@/lib/ai/prompts/tumor-prompts'
import type { PriceData, QuotationTemplateVars, DocxTemplateData } from './types'
import { cleanJsonString, TEMPLATE_MAP } from './utils'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import crypto from 'crypto'
import { db } from '@/lib/db/index'
import { fileAsset } from '@/lib/db/schema'

const QUOTATION_MODEL_ID = 'alibaba/deepseek-v3'

/**
 * Step 1: 提取价格数据
 */
export async function extractPriceData(
  userQuery: string,
  chatHistory: string,
  fileContent?: string
): Promise<PriceData | null> {
  const selectPrompt = SELECT_PROMPT_BOTH
    .replace('{userQuery}', userQuery)
    .replace('{chatHistory}', chatHistory)
    .replace('{fileContent}', fileContent || '')

  const priceResult = await streamText({
    model: getLanguageModel(QUOTATION_MODEL_ID),
    system: 'You are a precise pricing assistant. Return only valid JSON.',
    prompt: selectPrompt,
  })

  const priceText = await priceResult.text
  const cleaned = cleanJsonString(priceText)

  try {
    return JSON.parse(cleaned) as PriceData
  } catch (error) {
    console.error('[TumorWorkflow] 价格数据解析失败:', error)
    console.error('[TumorWorkflow] 原始响应:', priceText)
    return null
  }
}

/**
 * Step 2: 生成 Markdown 报价单（流式输出）
 */
export async function generateMarkdownQuotation(
  userQuery: string,
  chatHistory: string,
  priceData: PriceData,
  fileContent?: string
): Promise<{ mdContent: string; textStream: AsyncIterable<string> }> {
  const mdPrompt = `
用户提问：${userQuery}
历史对话：${chatHistory}

已确定的相关信息：
- 模型分类（CN）：${priceData.modelTypeCN}
- 模型分类（EN）：${priceData.modelTypeEN}
- 动物品系（CN）：${priceData.strainCN}
- 动物品系（EN）：${priceData.strainEN}
- 接种方式：${priceData.route}
- 人民币单价：￥${priceData.unitPriceRMB}
- 美元单价：$${priceData.unitPriceUSD}

请用 Markdown 表格格式输出报价单，包括：
1. 基础信息：客户名、细胞系、动物品系、接种方式
2. 动物数量计算
3. 价格信息（RMB + USD 双列）
4. 实验设计：评价指标、分组方式、给药方式
5. 附加服务（如 IVIS 成像、样本收集等）

**重要：**
- 直接输出 Markdown 内容，不要使用 \`\`\`markdown 或 \`\`\` 代码块包裹。
- **不要**生成文件下载链接（Word 文档会自动在下方显示）。
- 在表格最后添加一句简短提示："报价单已生成，请查看下方的 Word 文档附件。"
`

  const result = await streamText({
    model: getLanguageModel(QUOTATION_MODEL_ID),
    messages: [{ role: 'user', content: mdPrompt }],
  })

  let mdContent = ''
  const chunks: string[] = []

  // 流式收集输出
  for await (const chunk of result.textStream) {
    chunks.push(chunk)
    mdContent += chunk
  }

  return {
    mdContent,
    textStream: (async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    })(),
  }
}

/**
 * Step 3: 提取模板变量（20+ 字段）
 */
export async function extractTemplateVars(
  userQuery: string,
  mdContent: string,
  chatHistory: string
): Promise<QuotationTemplateVars> {
  const prompt = `
用户留言："""${userQuery}"""
报价信息："""${mdContent}"""
历史对话："""${chatHistory}"""

结合历史对话以及用户意图，提取以下字段，返回 **严格 JSON**（不要任何解释）：
{
  "Client": "模型名称/实验描述",
  "Client_En": "English client name",
  "CellLine": "细胞系名称",
  "CellLine_En": "English cell line",
  "AnimalStrain": "动物品系",
  "AnimalStrain_En": "English animal strain",
  "type": "接种方式（皮下瘤/系统流/原位/转移）",
  "type_En": "English type",
  "Evaluations": "药效评价指标",
  "Evaluations_En": "English evaluations",
  "UnitPrice": "单价 (数字)",
  "Quantity": "总数量 (数字)",
  "TotalPrice": "总价 (数字)",
  "Groups": "组数 (数字)",
  "GroupQuantity": "每组数量 (数字或数组)",
  "Grouping": "分组方式",
  "Grouping_En": "English grouping",
  "Administration": "给药方式",
  "Administration_En": "English administration",
  "SampleSize": "额外样本数 (数字)",
  "AnimalWeight": "动物体重要求",
  "AnimalWeight_En": "English animal weight",
  "ClinicalPractice": "临床操作",
  "IVISImagingTimes": "IVIS 成像次数 (数字)",
  "IVISImagingDays": "IVIS 成像时间",
  "IVISImagingDays_En": "English IVIS days",
  "AllIVISImagingTimes": "总计 IVIS 成像次数",
  "TestArticles": "测试药物名称",
  "DosingRoute": "给药途径",
  "DosingFrequency": "给药频次",
  "Dosage": "给药剂量"
}
`

  const result = await streamText({
    model: getLanguageModel(QUOTATION_MODEL_ID),
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = await result.text
  const cleaned = cleanJsonString(raw)
  return JSON.parse(cleaned) as QuotationTemplateVars
}

/**
 * Step 4: 组装 docxtemplater 数据（含 groups 数组）
 */
export function buildDocxData(vars: QuotationTemplateVars, modelType: string): DocxTemplateData {
  // 动态生成表格行
  const groups = Array.from({ length: vars.Groups || 1 }, (_, i) => {
    const testArticle = Array.isArray(vars.TestArticles)
      ? vars.TestArticles[i] || vars.TestArticles[0] || `TA-${i + 1}`
      : vars.TestArticles || `TA-${i + 1}`

    const groupQuantity = Array.isArray(vars.GroupQuantity)
      ? vars.GroupQuantity[i] || vars.GroupQuantity[0] || 0
      : vars.GroupQuantity || 0

    const dosage = Array.isArray(vars.Dosage)
      ? vars.Dosage[i] || vars.Dosage[0] || 'TBD'
      : vars.Dosage || 'TBD'

    return {
      GroupID: i + 1,
      TestArticles: testArticle,
      N: groupQuantity as number,
      Dosage: dosage as string,
      DosingRegimen: `${vars.DosingRoute || 'TBD'} ${vars.DosingFrequency || 'TBD'}`.trim(),
    }
  })

  // 计算附加费用
  let additionalRMB = 0
  let additionalUSD = 0

  // SampleSize 相关费用
  if (vars.SampleSize > 0) {
    additionalRMB += 60 * vars.SampleSize + 120 * vars.SampleSize
    additionalUSD += 10 * vars.SampleSize + 20 * vars.SampleSize
  }

  // IVIS 成像费用（仅原位/系统瘤模型）
  if (
    (modelType === 'ORTHOTOPIC' || modelType === 'SYSTEMATIC') &&
    vars.IVISImagingTimes > 0 &&
    vars.Quantity > 0
  ) {
    additionalRMB += 250 * vars.IVISImagingTimes * vars.Quantity
    additionalUSD += 60 * vars.IVISImagingTimes * vars.Quantity
  }

  // 计算总价
  const totalPriceNum = typeof vars.TotalPrice === 'string'
    ? parseFloat(vars.TotalPrice.replace(/,/g, ''))
    : vars.TotalPrice

  return {
    ...vars,
    groups,
    TotalPriceByRMB: totalPriceNum + additionalRMB,
    TotalPriceByUSD: totalPriceNum + additionalUSD,
  }
}

/**
 * Step 5: 生成 Word 文档
 */
export async function generateWordQuote(
  data: DocxTemplateData,
  language: string,
  modelType: string,
  userId: string
): Promise<{ fileId: string; fileName: string }> {
  const templateDir = path.join(process.cwd(), 'public', 'word')

  // 选择模板
  const templateConfig = TEMPLATE_MAP[modelType as keyof typeof TEMPLATE_MAP]?.[language as 'RMB' | 'USD']

  if (!templateConfig) {
    return { fileId: 'template_not_found', fileName: 'Quote.docx' }
  }

  const templatePath = path.join(templateDir, templateConfig.template)
  if (!existsSync(templatePath)) {
    return { fileId: 'template_not_found', fileName: templateConfig.template }
  }

  // 读取并渲染模板
  const content = readFileSync(templatePath, 'binary')
  const zip = new PizZip(content)

  let doc: Docxtemplater
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })
  } catch (error) {
    console.error('[WordGenerator] 模板加载失败:', error)
    return { fileId: 'template_error', fileName: templateConfig.template }
  }

  try {
    doc.render(data)
  } catch (error) {
    console.error('[WordGenerator] 模板渲染失败:', error)
    return { fileId: 'render_error', fileName: templateConfig.template }
  }

  const buf = doc.getZip().generate({ type: 'nodebuffer' })
  const base64Content = buf.toString('base64')
  const fileName = `${data.Client}${templateConfig.suffix}.docx`

  // 保存到 fileAsset 表
  const fileId = await saveWordFile({
    fileName,
    base64Content,
    userId,
  })

  return { fileId, fileName }
}

/**
 * 保存 Word 文件到数据库
 */
async function saveWordFile({
  fileName,
  base64Content,
  userId,
}: {
  fileName: string
  base64Content: string
  userId: string
}): Promise<string> {
  const checksum = crypto.createHash('md5').update(base64Content).digest('hex')
  const id = crypto.randomUUID()

  try {
    const inserted = await db
      .insert(fileAsset)
      .values({
        id,
        filename: fileName,
        content: base64Content,
        size: base64Content.length,
        checksum,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploaderId: userId,
        isActive: true,
      })
      .returning()

    if (inserted && inserted.length > 0) {
      console.log('[WordGenerator] 文件上传成功:', id)
      return inserted[0].id
    }

    return 'upload_failed'
  } catch (error) {
    console.error('[WordGenerator] 文件上传异常:', error)
    return 'upload_error'
  }
}
