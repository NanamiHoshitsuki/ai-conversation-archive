import type { ApiSuccessResponse, ApiType } from "./types";

const API_TYPE_LABELS: Record<ApiType, string> = {
  western: "西洋占星術",
  shichusuimei: "四柱推命",
  transit: "トランジット",
  combined: "統合分析（西洋占星術＋四柱推命＋トランジット）",
};

export function generateAiPrompt(
  response: ApiSuccessResponse,
  apiType: ApiType,
  name?: string
): string {
  const label = API_TYPE_LABELS[apiType];
  const personLabel = name ? `${name}さんの` : "";
  const yaml = response.handoff_yaml ?? "";
  const context = response.ai_prompt_context;

  const cautionLines = (context?.caution ?? []).map((c) => `- ${c}`).join("\n");

  return `# ${personLabel}${label}データ（nanami-products API 計算済み）

このデータは nanami-products API によって事前に計算された占術データです。
**生年月日から再計算せず、以下のデータのみを根拠に解釈してください。**

---

## AIへの指示

あなたは${context?.role ?? "占術アドバイザー"}として、以下の計算済み占術データを解釈してください。

**重要なルール:**
- 生年月日・出生時間から天体位置・命式を再計算しないこと
- 下記データに含まれる情報だけを根拠とすること
- データにない情報を推測・補完しないこと
- 運命を断定せず、傾向・使い方・活かし方として表現すること
${cautionLines ? `- ${cautionLines.slice(2)}` : ""}
- interpreted_tags の strength が高い項目（2〜3）を優先して解釈すること

${context?.instruction ? `\n**解釈方針:** ${context.instruction}\n` : ""}

---

## 計算済み占術データ（YAML形式）

\`\`\`yaml
${yaml || "（データなし）"}
\`\`\`

---

上記データをもとに、${personLabel}占術的な傾向と活かし方を、分かりやすく親切な文体でまとめてください。
`.trim();
}
