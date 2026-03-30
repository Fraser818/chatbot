/**
 * Tumor Quotation 类型定义
 * 从 Wilkins src/lib/agents/tumor/quotation.ts 迁移
 */

/**
 * 报价模板变量接口（20+ 字段）
 */
export interface QuotationTemplateVars {
  // 中文字段
  Client: string // 客户名/实验描述
  CellLine: string // 细胞系
  AnimalStrain: string // 动物品系
  type: string // 接种方式（皮下瘤/系统流/原位/转移）
  Evaluations: string // 药效评价指标
  UnitPrice: number | string // 单价（可能是带千位分隔符的字符串）
  Quantity: number // 数量
  TotalPrice: number | string // 总价（可能是带千位分隔符的字符串）
  Groups: number // 组数
  GroupQuantity: number | number[] // 每组数量（支持不同数量时用数组）
  Grouping: string // 分组方式（如：100-150 mm3）
  Administration: string // 给药方式
  SampleSize: number // 样本数量
  AnimalWeight: string // 动物体重相关要求
  AnimalWeight_En: string // 动物体重相关要求英文
  ClinicalPractice: string // 临床操作
  // 英文字段
  Client_En: string // 客户名英文
  CellLine_En: string // 细胞系英文
  AnimalStrain_En: string // 动物品系英文
  type_En: string // 接种方式英文
  Evaluations_En: string // 药效评价指标英文
  Grouping_En: string // 分组方式英文
  Administration_En: string // 给药方式英文

  // 额外字段
  IVISImagingTimes: number // IVIS 成像次数
  IVISByRMB: number | string // IVIS 成像总价格（人民币）
  IVISByUSD: number | string // IVIS 成像总价格（美元）
  IVISImagingDays: string // IVIS 成像时间
  IVISImagingDays_En: string // IVIS 成像时间英文
  AllIVISImagingTimes: number | string // 总计 IVIS 成像次数

  RegularByRMB: number | string // 常规样品收集及固定（人民币）
  BrainByRMB: number | string // 脑组织收集（人民币）
  RegularByUSD: number | string // 常规样品收集及固定（美元）
  BrainByUSD: number | string // 脑组织收集（美元）

  TotalPriceByRMB: number | string // 总价（人民币）
  TotalPriceByUSD: number | string // 总价（美元）

  // 新增：药物相关信息
  TestArticles: string | string[] // 测试药物名称（单组为字符串，多组为数组）
  DosingRoute: string // 给药途径（如：IP/口服/静脉等）
  DosingFrequency: string // 给药频次（如：QD/BID/TIW/BIW 等）
  Dosage: string | string[] // 给药剂量（单组为字符串，多组为数组）
}

/**
 * docxtemplater 需要的完整数据结构（包含 groups 数组）
 */
export interface DocxTemplateData extends QuotationTemplateVars {
  groups: {
    GroupID: number
    TestArticles: string
    N: number
    Dosage: string
    DosingRegimen: string
  }[]
}

/**
 * 价格数据接口（从 LLM 提取）
 */
export interface PriceData {
  modelTypeCN: string // 中文模型分类
  modelTypeEN: string // 英文模型分类
  strainCN: string // 中文动物品系
  strainEN: string // 英文动物品系
  route: string // 接种方式（subQ/sys/ortho）
  unitPriceRMB: number // 人民币单价
  unitPriceUSD: number // 美元单价
}

/**
 * 模型类型枚举
 */
export type ModelType = 'SUBQ' | 'ORTHOTOPIC' | 'SYSTEMATIC'

/**
 * 语言配置接口
 */
export interface LanguageConfig {
  code: 'RMB' | 'USD'
  name: string
  currency: string
  price: number
}
