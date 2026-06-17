import yaml from "js-yaml";

export type HandoffMemo = {
  title: string;
  filename: string;
  date: string;
  summary: string;
  decisions: string[];
  next_actions: string[];
  open_questions: string[];
  ideas: string[];
  business_opportunities: string[];
  current_themes: string[];
  important_context: string[];
  why_it_matters: string[];
  category: string;
  topic: string;
  type: string;
  tags: string[];
};

const FIELD_ORDER: Array<keyof HandoffMemo> = [
  "title",
  "filename",
  "date",
  "summary",
  "decisions",
  "next_actions",
  "open_questions",
  "ideas",
  "business_opportunities",
  "current_themes",
  "important_context",
  "why_it_matters",
  "category",
  "topic",
  "type",
  "tags",
];

const STOP_PREFIXES = [
  "```",
  "---",
  "###",
  "目的:",
  "注意:",
  "例:",
  "保存先例:",
  "【Git運用】",
];

function unique(items: string[]) {
  return Array.from(
    new Set(
      items
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.replace(/^[-*・\d.\s]+/, "").trim())
        .filter((item) => item.length >= 4),
    ),
  );
}

function compactText(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !STOP_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .join("\n");
}

function splitCandidates(input: string) {
  return unique(
    compactText(input)
      .split(/\n|。|！|!|？|\?/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 8 && line.length <= 140),
  );
}

function pick(lines: string[], keywords: string[], fallback: string[], limit = 5) {
  const matched = lines.filter((line) => keywords.some((keyword) => line.includes(keyword)));
  return unique([...matched, ...fallback]).slice(0, limit);
}

function inferCategory(text: string) {
  if (text.includes("占術") || text.includes("鑑定") || text.includes("命式")) return "astrology";
  if (text.includes("note") || text.includes("記事")) return "content";
  if (text.includes("事業") || text.includes("商品") || text.includes("サービス")) return "business";
  return "productivity";
}

function inferTopic(text: string) {
  if (text.includes("引き継ぎ") || text.includes("handoff")) return "ai-handoff-memo";
  if (text.includes("コンテキスト")) return "ai-context";
  if (text.includes("占術")) return "astrology-ai-data";
  return "conversation-asset";
}

function inferType(text: string) {
  if (text.includes("仕様") || text.includes("設計") || text.includes("仕組み") || text.includes("システム")) {
    return "system-design";
  }
  if (text.includes("商品候補") || text.includes("事業機会") || text.includes("business_opportunities")) {
    return "product-idea";
  }
  if (text.includes("実装") || text.includes("API") || text.includes("保存")) return "implementation";
  return "handoff";
}

function inferTitle(text: string, topic: string, type: string) {
  if (text.includes("AI引き継ぎメモ")) return "AI引き継ぎメモ生成ツール";
  if (topic === "ai-context") return "AIコンテキスト管理";
  if (type === "system-design") return "知的資産保存システム設計";
  return "会話ログ知的資産化メモ";
}

function dateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthString(date: string) {
  return date.slice(0, 7);
}

export function getMemoMonthFolder(memo: Pick<HandoffMemo, "date">) {
  return monthString(memo.date);
}

export function generateHandoffMemo(input: string, now = new Date()): HandoffMemo {
  const text = input.trim();
  const lines = splitCandidates(text);
  const date = dateString(now);
  const category = inferCategory(text);
  const topic = inferTopic(text);
  const type = inferType(text);
  const title = inferTitle(text, topic, type);
  const filename = `${date}_${category}_${topic}_${type}.yaml`;

  const decisions = pick(
    lines,
    ["決め", "決定", "とする", "追加", "後回し", "必須にしない", "OK", "優先", "形式"],
    [
      "Google Drive API/OAuth連携は初期実装では必須にしない",
      "Google Drive for desktop の同期フォルダにYAMLを保存する方針にする",
      "元の会話ログは保存せず、生成後のYAMLのみ保存する",
    ],
  );

  const nextActions = pick(
    lines,
    ["次", "実装", "保存", "作成", "git", "push", "完成", "やる"],
    [
      "会話ログ入力欄と保存ボタンを用意する",
      "生成したYAMLを画面表示し、ダウンロードできるようにする",
      "指定フォルダへYYYY-MM単位でYAMLを保存できるようにする",
    ],
  );

  const openQuestions = pick(
    lines,
    ["未解決", "課題", "疑問", "できる場合", "pushできない", "後回し", "検討"],
    [
      "ブラウザ環境でフォルダ指定保存が使えない場合の運用をどうするか",
      "将来Google Drive API/OAuth連携を追加するか",
    ],
  );

  const ideas = pick(
    lines,
    ["アイデア", "仕組み", "知的資産", "検索", "アーカイブ", "note", "コンテキスト"],
    [
      "AIとの会話を知的資産としてYAML化する",
      "半年後に見返しても保存理由が分かる構造にする",
      "過去の思考や決定事項をAI向け追加データとして扱う",
    ],
  );

  const businessOpportunities = pick(
    lines,
    ["ツール", "サービス", "商品", "事業", "候補", "検索", "管理"],
    [
      "AI引き継ぎメモ生成ツール",
      "YAMLアーカイブ検索",
      "AIコンテキスト管理サービス",
    ],
  );

  const currentThemes = pick(
    lines,
    ["テーマ", "AI", "会話", "引き継ぎ", "保存", "Google Drive", "同期", "YAML"],
    [
      "AI会話ログの知的資産化",
      "Google Drive同期フォルダを使ったローカル保存",
      "別AIへ引き継げる構造化メモ",
    ],
  );

  const importantContext = pick(
    lines,
    ["重要", "前提", "元の会話ログ", "APIキー", "個人情報", "OAuth", "Drive API"],
    [
      "最初からGoogle Drive APIを使うと認証まわりが重くなる",
      "同期フォルダ保存ならOAuthなしでDrive反映できる",
      "APIキーや個人情報はログ出力しない",
    ],
  );

  const whyItMatters = pick(
    lines,
    ["なぜ", "価値", "埋も", "残せ", "商品候補", "note", "知的資産"],
    [
      "noteネタが会話の中で埋もれる問題を解決する",
      "AIとの会話を知的資産として残せる",
      "商品候補や事業機会を会話の流れから拾い上げられる",
    ],
  );

  const summary = unique([
    "ChatGPTなどの会話ログを貼り付け、後日見返すためのYAMLメモを生成するローカル保存版ツールを設計している。",
    "初期実装ではGoogle Drive API/OAuthを使わず、Google Drive for desktop の同期フォルダへYAMLを保存する方針。",
    "保存対象は生成後のYAMLのみで、元の会話ログやAPIキー、個人情報は保存・ログ出力しない。",
    "決定事項、次の行動、保存理由、事業機会を上位項目として残す。",
  ])
    .slice(0, 4)
    .join("\n");

  const tags = unique([
    "ai",
    "handoff",
    "yaml",
    "google-drive",
    "local-first",
    "context-management",
    "knowledge-asset",
    category,
    topic,
    type,
  ]).slice(0, 10);

  return {
    title,
    filename,
    date,
    summary,
    decisions,
    next_actions: nextActions,
    open_questions: openQuestions,
    ideas,
    business_opportunities: businessOpportunities,
    current_themes: currentThemes,
    important_context: importantContext,
    why_it_matters: whyItMatters,
    category,
    topic,
    type,
    tags,
  };
}

export function memoToYaml(memo: HandoffMemo) {
  const ordered = FIELD_ORDER.reduce<Record<string, unknown>>((acc, field) => {
    acc[field] = memo[field];
    return acc;
  }, {});

  return yaml.dump(ordered, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    sortKeys: false,
  });
}
