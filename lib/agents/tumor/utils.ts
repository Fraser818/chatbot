/**
 * Tumor Quotation 工具函数
 * 从 Wilkins src/lib/agents/tumor/quotation.ts 迁移
 */

import type { ModelType } from './types'

/**
 * 数字千位分隔符格式化
 */
export function formatNumberWithCommas(num: number | string | undefined): string {
  if (num === undefined || num === null || num === 'TBD') return 'TBD'
  const n = typeof num === 'string' ? parseFloat(num) : num
  if (isNaN(n)) return 'TBD'
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 根据接种方式路由推断模型类型
 * 对应 Wilkins 中的 METASTATIC/ORTHOTOPIC/SYSTEMATIC
 */
export function getModelTypeFromRoute(route: string): ModelType {
  const normalizedRoute = route.toLowerCase()

  if (normalizedRoute.includes('ortho') || normalizedRoute.includes('原位')) {
    return 'ORTHOTOPIC'
  }

  if (normalizedRoute.includes('sys') || normalizedRoute.includes('系统')) {
    return 'SYSTEMATIC'
  }

  // 默认皮下接种
  return 'SUBQ'
}

/**
 * 清洁 JSON 字符串（移除 Markdown 代码块标记）
 */
export function cleanJsonString(text: string): string {
  return text.replace(/^```json\s*/i, '').replace(/\s*```$/g, '').trim()
}

/**
 * 模板配置映射表（6 种模板）
 */
export const TEMPLATE_MAP: Record<
  ModelType,
  Record<'RMB' | 'USD', { template: string; suffix: string; lang: string }>
> = {
  SUBQ: {
    RMB: { template: '皮下中文报价.docx', suffix: '_报价单', lang: '中文' },
    USD: { template: '皮下英文报价.docx', suffix: '_Quotation', lang: '英文' },
  },
  SYSTEMATIC: {
    RMB: { template: '系统瘤中文报价.docx', suffix: '_报价单', lang: '中文' },
    USD: { template: '系统瘤英文报价.docx', suffix: '_Quotation', lang: '英文' },
  },
  ORTHOTOPIC: {
    RMB: { template: '原位中文报价.docx', suffix: '_报价单', lang: '中文' },
    USD: { template: '原位英文报价.docx', suffix: '_Quotation', lang: '英文' },
  },
}
