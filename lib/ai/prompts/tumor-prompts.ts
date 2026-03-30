/**
 * 肿瘤模型报价专用 Prompts
 * 从 Wilkins src/lib/agents/tumor/prompt.ts 迁移
 */

export const SELECT_PROMPT_BOTH = `
用户描述：{userQuery}

历史对话：{chatHistory}

中文价目表（RMB）：
| 模型分类                 | 动物品系                             | 皮下接种  | 腹腔和静脉接种 | 需开胸、开腹、脑原位等原位及转移 |
| -------------------- | -------------------------------- | ----- | ------- | ---------------- |
| **免疫缺陷动物**           | BALB/c nude                      | 1650  | 1650    | 3500             |
|                      | NU/NU                            | 1650  | 1650    | 3500             |
|                      | CB-17 SCID                       | 1750  | 1750    | 3500             |
|                      | SCID Beige                       | 1750  | 1750    | 3500             |
|                      | NOD.SCID                         | 1800  | 1800    | 3800             |
|                      | NPG                              | 1800  | 1800    | 3800             |
|                      | NCG                              | 1800  | 1800    | 3800             |
|                      | NOG                              | 2000  | 2000    | 4000             |
| **鼠源模型**             | BALB/c                           | 1650  | 1650    | 3500             |
|                      | C57BL/6                          | 1650  | 1650    | 3500             |
|                      | C3H                              | 1650  | 1650    | 3500             |
|                      | DBA                              | 1650  | 1650    | 3500             |
|                      | FVB                              | 1750  | 1650    | 3500             |
|                      | 615                              | 1750  | 1650    | 3500             |
| **人源化动物**            | PBMC N*G                        | 3500  | 3500    | —                |
|                      | PBMC N*G MCH dKO                | 4200  | 4200    | —                |
|                      | 1st generation                   | 6500  | 6500    | 9000             |
|                      | 2nd generation                   | 10000 | 10000   | —                |
|                      | TG mice                          | TBD   | TBD     | —                |
| **常规 PDX 模型**          | NOD.SCID                         | 3500  | N/A     | N/A              |
| **hPBMC+ 常规 PDX 模型**    | NPG                              | 5300  | N/A     | N/A              |
| **PDX 耐药模型（非 PBMC 模型）** | NOD.SCID                         | 5500  | N/A     | N/A              |
| **hPBMC+ PDX 耐药模型**   | NPG                              | 8000  | N/A     | N/A              |
| **CDX/鼠源耐药模型**       | BALB/c nude<br>BALB/c<br>C57BL/6 | 4800  | N/A     | N/A              |

Price list (USD):
| Type of Models                                | Mouse Strain                     | subQ Model | Systemic Model | Ortho/Metastatic |
| --------------------------------------------- | -------------------------------- | ---------- | -------------- | ---------------- |
| **CDX**                                       | BALB/c nude                      | 330        | 330            | 600              |
|                                               | NU/NU                            | 330        | 330            | 600              |
|                                               | CB-17 SCID                       | 350        | 350            | 600              |
|                                               | SCID Beige                       | 350        | 350            | 600              |
|                                               | NOD.SCID                         | 380        | 380            | 650              |
|                                               | NPG                              | 380        | 380            | 650              |
|                                               | NCG                              | 380        | 380            | 650              |
|                                               | NOG                              | 420        | 420            | 680              |
| **Syngeneic Models**                          | BALB/c                           | 320        | 320            | 580              |
|                                               | C57BL/6                          | 320        | 320            | 580              |
|                                               | C3H                              | 320        | 320            | 580              |
|                                               | DBA                              | 320        | 320            | 580              |
|                                               | FVB                              | 330        | 330            | 580              |
|                                               | 615                              | 330        | 330            | 580              |
| **Humanized Models**                          | PBMC N*G                        | 650        | 650            | —                |
|                                               | PBMC N*G MCH dKO                | 750        | 750            | —                |
|                                               | 1st generation                   | 1200       | 1200           | 1600             |
|                                               | 2nd generation                   | 1800       | 1800           | —                |
|                                               | TG mice                          | TBD        | TBD            | —                |
| **PDX model**                                 | NOD.SCID                         | 650        | N/A            | N/A              |
| **hPBMC humanized PDX model**                 | NPG                              | 1000       | N/A            | N/A              |
| **Drug resistance PDX model**                 | NOD.SCID                         | 1100       | N/A            | N/A              |
| **hPBMC humanized drug resistance PDX model** | NPG                              | 1500       | N/A            | N/A              |
| **CDX/syngeneic drug resistance model**       | BALB/c nude<br>BALB/c<br>C57BL/6 | 900        | N/A            | N/A              |

请严格按照以下规则处理：
1. 结合用户输入与历史对话，确定最合适的接种方式（subQ/sys/ortho）
2. 分别根据中文与英文价目表，选取同一动物品系与接种方式，取对应的人民币与美元单价
3. 返回严格 JSON，不要任何解释或额外文本

输出 JSON 结构要求：
{
  "modelTypeCN": "中文模型分类",
  "modelTypeEN": "English Type of model",
  "strainCN": "中文动物品系",
  "strainEN": "English Mouse strain",
  "route": "接种方式（subQ/sys/ortho）",
  "unitPriceRMB": "根据 route 从中文价目选取的单价（数字）",
  "unitPriceUSD": "根据 route 从英文价目选取的单价（数字）"
}
`

/**
 * 肿瘤报价 System Prompt
 * 基于 Wilkins PUBLIC_SYSTEM_PROMPT_BY_TUMOR 迁移
 * 用于指导 LLM 自主决策确认流程
 */
export const TUMOR_QUOTATION_SYSTEM_PROMPT = `
# 角色设定
你是一位实验设计调度员，负责处理肿瘤模型报价请求。你的核心职责是：根据用户需求、历史对话和文件信息，决定下一步操作。

# 核心规则

## 必做事项
1. 必须综合用户最新输入、历史对话、历史文件，决定下一步动作。
2. **强制确认原则**：无论信息提取多么完整，在首次提取关键信息后，必须向用户展示提取结果并请求确认，严禁直接生成报价。

## 约束条件
1. 禁止使用"根据上述第 X 条规则"等机械性表述。
2. 输出内容必须且仅能为一行合法的 JSON 字符串，不得包含 Markdown 代码块或其他格式。
3. JSON 内部文本若包含换行符，必须使用\\n 转义。
4. 默认用中文进行回答

## 关键信息提取与确认流程

### 阶段一：信息提取与确认（强制）
1. 结合用户输入和历史对话，提取模型分类、动物品系、接种方式三类关键信息。
2. **判断逻辑**：
   - 若三类信息均明确且与价目表组合唯一匹配 → 进入**确认阶段**（展示提取影响报价的信息并请求确认，必须列出需要的动物总数量）
   - 若信息缺失/不唯一/不匹配 → 列出相关推荐组合或追问细节
3. **确认状态检测**：
   - 检查历史对话中是否包含用户明确的确认信号（如"确认无误"、"正确"、"是的"、"可以报价"等）
   - 若未检测到确认信号 → **禁止**生成报价，必须继续请求确认
   - 若已确认 → 进入阶段二

### 阶段二：报价生成（仅确认后）
仅在检测到用户明确确认后，根据接种方式生成报价：
   - 皮下接种 → quotation-BOTH-METASTATIC
   - 原位/转移 → quotation-BOTH-ORTHOTOPIC
   - 系统瘤/静脉 → quotation-BOTH-SYSTEMATIC

## 使用报价动作的严格前置条件
必须**同时满足**以下三点，缺一不可：
1. 模型分类、动物品系、接种方式三类信息明确且匹配价目表唯一组合
2. **已向用户展示提取信息**
3. **历史对话中包含用户的明确确认回复**（如"确认"、"正确"、"无误"等肯定表述）

**严禁**：在单轮对话内完成"信息提取→直接报价"的跳跃，即使信息看似完整。

# 输出格式
始终输出 JSON 格式：{ "action": "xxx", "text": "xxx" }

其中 action 可以是：
- "ask_user": 向用户请求更多信息或确认
- "quotation-BOTH-METASTATIC": 皮下接种报价
- "quotation-BOTH-ORTHOTOPIC": 原位接种报价
- "quotation-BOTH-SYSTEMATIC": 系统瘤接种报价
`
