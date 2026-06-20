import yaml from "js-yaml";

export type HandoffMemo = {
  title: string;
  filename: string;
  date: string;
  source?: {
    source_mode: "bulk-convert" | "chat-save";
    conversation_id?: string | null;
    source_log_file?: string | null;
    trigger_command?: "/archive" | "/アーカイブ" | "/保存" | "/log" | "/ログ" | "/元ログ" | "/保存+元ログ" | "/archive-full";
    platform?: string;
    conversation_title?: string;
    conversation_url?: string;
    saved_at: string;
    anchor_text?: string;
    message_index?: number;
    captured_range?: {
      before_messages: number;
      after_messages: number;
    };
  };
  summary: string;
  decisions: string[];
  next_actions: string[];
  open_questions: string[];
  ideas: string[];
  important_context: string[];
  why_it_matters: string[];
  category: string;
  topic: string;
  type: string;
  tags: string[];
  reuse_for: string[];
  business_opportunities?: string[];
  research_questions?: string[];
  content_ideas?: string[];
};

export const HANDOFF_MEMO_SYSTEM_PROMPT = `
あなたはAI会話知識アーカイブのYAML生成器です。

目的:
- AIとの会話を再利用可能な知的資産としてYAML化する。
- 会話全文をそのまま保存せず、後日見返す・別AIへ引き継ぐ・成果物として再利用するための情報へ圧縮する。

抽出方針:
- 決定事項、次アクション、未解決事項、重要な文脈、再利用用途を優先する。
- /archive や /保存 などの保存コマンド自体はYAML対象から除外する。
- 不確かな内容は断定しない。
- 会話に存在しない情報を補完しない。
- 必要な項目がない場合は空配列または省略で対応する。
- business_opportunities / research_questions / content_ideas は該当内容がある場合のみ出力する。

基本項目:
- title
- filename
- date
- source
- source.platform
- summary
- decisions
- next_actions
- open_questions
- ideas
- important_context
- why_it_matters
- category
- topic
- type
- tags
- reuse_for
`.trim();

const FIELD_ORDER: Array<keyof HandoffMemo> = [
  "title",
  "filename",
  "date",
  "source",
  "summary",
  "decisions",
  "next_actions",
  "open_questions",
  "ideas",
  "important_context",
  "why_it_matters",
  "category",
  "topic",
  "type",
  "tags",
  "reuse_for",
  "business_opportunities",
  "research_questions",
  "content_ideas",
];

type HandoffMemoSource = NonNullable<HandoffMemo["source"]>;

export type GenerateHandoffMemoOptions = {
  source?: Omit<HandoffMemoSource, "saved_at"> & {
    saved_at?: string;
  };
  systemPrompt?: string;
};

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
    .filter((line) => {
      const commandCandidate = line.replace(/^(ユーザー|AI|user|assistant)\s*[:：]\s*/i, "").trim();
      return line && !parseArchiveCommand(commandCandidate) && !STOP_PREFIXES.some((prefix) => line.startsWith(prefix));
    })
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

function pickConditional(lines: string[], keywords: string[], fallback: string[], limit = 5) {
  const matched = lines.filter((line) => keywords.some((keyword) => line.includes(keyword)));
  if (matched.length === 0) return undefined;
  return unique([...matched, ...fallback]).slice(0, limit);
}

function inferCategory(text: string) {
  if (text.includes("研究") || text.includes("論文") || text.includes("実験")) return "research";
  if (text.includes("小説") || text.includes("物語") || text.includes("創作")) return "creative";
  if (text.includes("記事") || text.includes("コンテンツ") || text.includes("投稿")) return "content";
  if (text.includes("事業") || text.includes("商品") || text.includes("サービス")) return "business";
  if (text.includes("実装") || text.includes("アプリ") || text.includes("ツール")) return "productivity";
  return "conversation";
}

function inferTopic(text: string) {
  if (text.includes("アーカイブ") || text.includes("知識資産")) return "ai-conversation-archive";
  if (text.includes("引き継ぎ") || text.includes("handoff")) return "ai-handoff-memo";
  if (text.includes("コンテキスト")) return "ai-context";
  return "general";
}

function inferType(text: string) {
  if (text.includes("仕様") || text.includes("設計") || text.includes("仕組み") || text.includes("システム")) {
    return "system-design";
  }
  if (text.includes("研究課題") || text.includes("research_questions")) return "research-note";
  if (text.includes("物語") || text.includes("story_ideas")) return "creative-note";
  if (text.includes("商品") || text.includes("事業機会") || text.includes("ビジネス")) return "business-note";
  if (text.includes("実装") || text.includes("API") || text.includes("保存")) return "implementation";
  return "archive";
}

function inferTitle(text: string, topic: string, type: string) {
  if (text.includes("AI会話知識アーカイブ")) return "AI会話知識アーカイブ標準フォーマット";
  if (text.includes("AI引き継ぎメモ")) return "AI会話知識アーカイブ";
  if (topic === "ai-context") return "AIコンテキスト管理";
  if (type === "system-design") return "再利用可能な成果物を保存する仕組み";
  return "AI会話からの再利用資産抽出";
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

function timestampString(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${hours}:${minutes}`;
}

function getAnchorText(text: string) {
  const compacted = compactText(text);
  if (!compacted) return undefined;
  const lines = compacted
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines.at(-1) ?? compacted;
  return lastLine.slice(0, 160);
}

function buildSource(
  text: string,
  now: Date,
  source?: GenerateHandoffMemoOptions["source"],
): HandoffMemoSource | undefined {
  if (!source) return undefined;

  const baseSource = {
    source_mode: source.source_mode,
    conversation_id: source.conversation_id ?? null,
    source_log_file: source.source_log_file ?? null,
  };
  const result: HandoffMemoSource = source.trigger_command
    ? {
        ...baseSource,
        trigger_command: source.trigger_command,
        saved_at: source.saved_at ?? timestampString(now),
      }
    : {
        ...baseSource,
        saved_at: source.saved_at ?? timestampString(now),
      };
  const anchorText = source.anchor_text ?? getAnchorText(text);
  if (source.platform?.trim()) result.platform = source.platform.trim();
  if (source.conversation_title?.trim()) result.conversation_title = source.conversation_title.trim();
  if (source.conversation_url?.trim()) result.conversation_url = source.conversation_url.trim();
  if (anchorText) result.anchor_text = anchorText;
  if (typeof source.message_index === "number") result.message_index = source.message_index;
  if (source.captured_range) result.captured_range = source.captured_range;
  return result;
}

export function getMemoMonthFolder(memo: Pick<HandoffMemo, "date">) {
  return monthString(memo.date);
}

export function getFallbackMemoFilename(now = new Date()) {
  return `${dateString(now)}_ai-handoff-memo.yaml`;
}

export function sanitizeArchiveFilenameTitle(title: string) {
  return title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function buildConversationTitleFilename(conversationTitle: string, date = new Date()) {
  const safeTitle = sanitizeArchiveFilenameTitle(conversationTitle);
  if (!safeTitle) return getFallbackMemoFilename(date);
  return `${dateString(date)}_${safeTitle}.yaml`;
}

export function stripArchiveFilenameExtension(filename: string) {
  return filename
    .trim()
    .replace(/\.zip$/i, "")
    .replace(/\.source\.md$/i, "")
    .replace(/\.ya?ml$/i, "")
    .replace(/\.md$/i, "");
}

export function buildArchiveFilename(baseFilename: string, extension: ".yaml" | ".source.md" | ".zip", fallbackDate = new Date()) {
  const base = stripArchiveFilenameExtension(baseFilename);
  const fallbackBase = stripArchiveFilenameExtension(getFallbackMemoFilename(fallbackDate));
  return `${base || fallbackBase}${extension}`;
}

export function getYamlDownloadFilename(yamlText: string, fallbackDate = new Date()) {
  try {
    const parsed = yaml.load(yamlText);
    if (parsed && typeof parsed === "object" && "filename" in parsed) {
      const filename = (parsed as { filename?: unknown }).filename;
      if (typeof filename === "string" && filename.trim()) {
        return buildArchiveFilename(filename, ".yaml", fallbackDate);
      }
    }
  } catch {
    return getFallbackMemoFilename(fallbackDate);
  }

  return getFallbackMemoFilename(fallbackDate);
}

export function getSourceLogFilenameFromYamlFilename(yamlFilename: string) {
  return buildArchiveFilename(yamlFilename, ".source.md");
}

export function getSourceLogDownloadFilename(yamlText: string, fallbackDate = new Date()) {
  try {
    const parsed = yaml.load(yamlText);
    if (parsed && typeof parsed === "object" && "source" in parsed) {
      const source = (parsed as { source?: { source_log_file?: unknown } }).source;
      if (source && typeof source.source_log_file === "string" && source.source_log_file.trim()) {
        return source.source_log_file.trim();
      }
    }
  } catch {
    return getSourceLogFilenameFromYamlFilename(getFallbackMemoFilename(fallbackDate));
  }

  return getSourceLogFilenameFromYamlFilename(getYamlDownloadFilename(yamlText, fallbackDate));
}

export type ArchiveCommand =
  | {
      command: "archive";
      trigger: "/archive" | "/アーカイブ" | "/保存";
    }
  | {
      command: "source-log";
      trigger: "/log" | "/ログ" | "/元ログ";
    }
  | {
      command: "archive-full";
      trigger: "/保存+元ログ" | "/archive-full";
    };

export function parseArchiveCommand(input: string): ArchiveCommand | null {
  const trimmed = input.trim();
  if (trimmed === "/archive") {
    return { command: "archive", trigger: "/archive" };
  }
  if (trimmed === "/アーカイブ") {
    return { command: "archive", trigger: "/アーカイブ" };
  }
  if (trimmed === "/保存") {
    return { command: "archive", trigger: "/保存" };
  }
  if (trimmed === "/log") {
    return { command: "source-log", trigger: "/log" };
  }
  if (trimmed === "/ログ") {
    return { command: "source-log", trigger: "/ログ" };
  }
  if (trimmed === "/元ログ") {
    return { command: "source-log", trigger: "/元ログ" };
  }
  if (trimmed === "/保存+元ログ") {
    return { command: "archive-full", trigger: "/保存+元ログ" };
  }
  if (trimmed === "/archive-full") {
    return { command: "archive-full", trigger: "/archive-full" };
  }
  return null;
}

export function generateHandoffMemo(
  input: string,
  now = new Date(),
  options: GenerateHandoffMemoOptions = {},
): HandoffMemo {
  const text = input.trim();
  const lines = splitCandidates(text);
  const date = dateString(now);
  const category = inferCategory(text);
  const topic = inferTopic(text);
  const type = inferType(text);
  const title = inferTitle(text, topic, type);
  const filename = options.source?.conversation_title?.trim()
    ? buildConversationTitleFilename(options.source.conversation_title, now)
    : `${date}_${category}_${topic}_${type}.yaml`;
  const systemPrompt = options.systemPrompt ?? HANDOFF_MEMO_SYSTEM_PROMPT;
  const allowConditionalFields =
    systemPrompt.includes("business_opportunities") &&
    systemPrompt.includes("research_questions") &&
    systemPrompt.includes("content_ideas");

  const decisions = pick(
    lines,
    ["決め", "決定", "とする", "追加", "後回し", "必須にしない", "OK", "優先", "形式"],
    [
      "会話全文ではなく再利用可能な成果物をYAMLとして保存する",
      "決定事項と次の行動を優先して記録する",
      "用途依存の情報は拡張ブロックとして扱う",
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
      "用途別の拡張ブロックをどこまで標準テンプレートに含めるか",
      "抽出精度をローカルルールで十分にするか、AI生成APIを使うか",
    ],
  );

  const ideas = pick(
    lines,
    ["アイデア", "仕組み", "知的資産", "検索", "アーカイブ", "コンテキスト", "再利用"],
    [
      "AIとの会話から再利用可能な成果物を抽出してYAML化する",
      "半年後に見返しても保存理由が分かる構造にする",
      "個人利用、業務利用、創作活動、研究活動に横展開できる標準フォーマットにする",
    ],
  );

  const businessOpportunities = pickConditional(
    lines,
    ["事業", "商品", "ビジネス", "サービス", "収益", "販売", "顧客", "市場", "起業"],
    [
      "AI会話知識アーカイブツール",
      "YAMLアーカイブ検索",
      "AIコンテキスト管理サービス",
    ],
  );

  const researchQuestions = pickConditional(
    lines,
    ["研究", "問い", "仮説", "検証", "実験", "調査", "論文"],
    [
      "会話から研究課題や検証仮説を抽出する",
      "意思決定ログを研究ノートとして再利用する",
    ],
  );

  const contentIdeas = pickConditional(
    lines,
    ["記事", "投稿", "コラム", "発信", "読者", "コンテンツ"],
    [
      "会話から記事化できる論点を抽出する",
      "発信ネタを会話の流れから拾い上げる",
    ],
  );

  const importantContext = pick(
    lines,
    ["重要", "前提", "元の会話ログ", "APIキー", "個人情報", "OAuth", "Drive API"],
    [
      "保存するのは会話ログそのものではなく、再利用可能な成果物である",
      "共通コアは用途を問わず読める項目に限定する",
      "用途依存の内容は拡張ブロックで分離する",
    ],
  );

  const whyItMatters = pick(
    lines,
    ["なぜ", "価値", "埋も", "残せ", "再利用", "知的資産", "文脈"],
    [
      "会話の中で生まれた決定、課題、アイデアを埋もれさせない",
      "AIとの会話を再利用可能な知識資産として残せる",
      "半年後に見返しても、なぜ保存したのかが分かる",
    ],
  );

  const summary = unique([
    "AIとの会話を単なるログではなく、後日再利用できる知識資産として保存するためのYAML形式を設計している。",
    "重要なのは会話全文の保存ではなく、決定事項、次の行動、未解決課題、アイデア、保存価値を残すことである。",
    "個人利用、業務利用、創作活動、研究活動など、用途を問わず再利用可能な成果物として扱う。",
    "共通コアは固定し、事業機会、研究課題、創作案などの用途依存項目は拡張ブロックで扱う。",
  ])
    .slice(0, 4)
    .join("\n");

  const tags = unique([
    "ai",
    "handoff",
    "yaml",
    "knowledge-archive",
    "reusable-output",
    "context-management",
    "knowledge-asset",
    category,
    topic,
    type,
  ]).slice(0, 10);

  const reuseFor = pick(
    lines,
    ["引き継ぎ", "再利用", "後日", "検索", "業務", "創作", "研究", "記事", "実装"],
    [
      "後日見返すための文脈復元",
      "別AIへの引き継ぎ",
      "次の作業や意思決定の再開",
    ],
  );

  const memo: HandoffMemo = {
    title,
    filename,
    date,
    source: buildSource(text, now, options.source),
    summary,
    decisions,
    next_actions: nextActions,
    open_questions: openQuestions,
    ideas,
    important_context: importantContext,
    why_it_matters: whyItMatters,
    category,
    topic,
    type,
    tags,
    reuse_for: reuseFor,
  };

  if (allowConditionalFields && businessOpportunities) memo.business_opportunities = businessOpportunities;
  if (allowConditionalFields && researchQuestions) memo.research_questions = researchQuestions;
  if (allowConditionalFields && contentIdeas) memo.content_ideas = contentIdeas;

  return memo;
}

export function memoToYaml(memo: HandoffMemo) {
  const ordered = FIELD_ORDER.reduce<Record<string, unknown>>((acc, field) => {
    const value = memo[field];
    if (value === undefined) return acc;
    if (Array.isArray(value) && value.length === 0) return acc;
    acc[field] = value;
    return acc;
  }, {});

  return yaml.dump(ordered, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    sortKeys: false,
  });
}
