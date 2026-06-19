"use client";

import { useEffect, useState } from "react";
import yaml from "js-yaml";
import {
  SHIORI_ARCHIVE_PROMPT,
  SHIORI_ARCHIVE_PROMPT_EN,
  SIMPLE_SHIORI_ARCHIVE_PROMPT,
  SIMPLE_SHIORI_ARCHIVE_PROMPT_EN,
} from "@/lib/archivePrompt";
import {
  buildArchiveFilename,
  buildConversationTitleFilename,
  generateHandoffMemo,
  getMemoMonthFolder,
  getSourceLogDownloadFilename,
  getSourceLogFilenameFromYamlFilename,
  stripArchiveFilenameExtension,
  getYamlDownloadFilename,
  memoToYaml,
  type HandoffMemo,
} from "@/lib/handoffMemo";

type WritableDirectoryHandle = {
  name?: string;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<WritableDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    getFile?: () => Promise<File>;
    createWritable(): Promise<{
      write(data: string): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
};

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<WritableDirectoryHandle>;
  }
}

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

type OutputTab = "yaml" | "source";
type InputTab = "memo-save" | "log-save" | "prompt" | "memo-create";
type PromptVariant = "simple" | "full";
type Language = "ja" | "en";

type SourceInfo = {
  platform: string;
  conversationTitle: string;
  conversationUrl: string;
  savedAt: string;
  bookmark: string;
};

type PreparedTextFile = {
  filename: string;
  content: string;
  mimeType: string;
};

const DIRECTORY_DB_NAME = "ai-conversation-archive";
const DIRECTORY_STORE_NAME = "settings";
const DIRECTORY_HANDLE_KEY = "directoryHandle";
const LANGUAGE_STORAGE_KEY = "aiConversationArchiveLanguage";
const EMPTY_CONTENT_MESSAGE = "保存する内容が空です。YAMLまたはMarkdownを読み込んでから保存してください。";
const FOLDER_SAVE_FAILURE_MESSAGE = [
  "フォルダ保存に失敗しました。",
  "",
  "Google Drive / OneDrive / iCloud Drive などの同期・マウントフォルダでは、ブラウザのフォルダ保存機能が正常に書き込めない場合があります。",
  "",
  "0 byte ファイルが残ることがあります。その場合は削除して、ブラウザの「ダウンロード保存」を使ってください。",
].join("\n");
const ZERO_BYTE_WARNING_MESSAGE = [
  "フォルダ保存後のファイルサイズが0 byteです。",
  "",
  "Google Drive / OneDrive / iCloud Drive などの同期・マウントフォルダでは書き込みが完了しない場合があります。",
  "0 byte ファイルを削除して、ブラウザの「ダウンロード保存」を使ってください。",
].join("\n");

const UI_TEXT = {
  ja: {
    language: "言語",
    japanese: "Japanese",
    english: "English",
    appTitle: "AI会話知識アーカイブ",
    tabMemoSave: "知識メモ保存（YAML）",
    tabLogSave: "会話ログ保存（Markdown）",
    tabPrompt: "しおりプロンプト",
    tabMemoCreate: "知識メモ作成",
    memoSaveTitle: "知識メモ保存（YAML）",
    memoSaveDescription:
      "ChatGPT、Claude、Geminiなどで生成した知識メモを貼り付けて保存します。conversation_title を入力すると YYYY-MM-DD_会話タイトル.yaml で保存します。",
    memoSavePlaceholder: "filename: example.yaml",
    logSaveTitle: "会話ログ保存（Markdown）",
    logSaveDescription:
      "ChatGPT、Claude、Geminiなどで生成した会話ログを貼り付けて保存します。Markdown形式のまま .md ファイルとして扱います。",
    logSavePlaceholder: "# Source Conversation",
    update: "更新",
    promptTitle: "しおりプロンプト",
    promptDescription: "日常利用向けの簡易版と、設計・詳細運用向けの完全版をコピーできます。",
    simple: "簡易版",
    full: "完全版",
    copyPrompt: (label: string) => `${label}をコピー`,
    memoCreateTitle: "知識メモ作成",
    memoCreateDescription:
      "会話ログ、個人メモ、アイデアメモ、note下書き、設計メモなどを貼り付け、再利用しやすい知識メモに変換します。",
    memoCreatePlaceholder: "知識メモに変換したい内容をここに貼り付け",
    createMemo: "知識メモを作成",
    sampleInput: "サンプル入力",
    filename: "filename",
    status: "status",
    standby: "待機中",
    saveInfo: "保存情報",
    saveInfoDescription: "元チャットを後から探しやすくするための情報です。conversation_title はファイル名にも利用されます。",
    titleFilenameHelp: "ファイル名にも利用されます。",
    sourceTitlePlaceholder: "AI会話アーカイブ設計",
    conversationUrlHelp: "元チャットURL（任意）",
    bookmarkHelp: "後で何を思い出したい会話かを記録します。",
    bookmarkPlaceholder: "どのチャットだったか思い出すためのしおりメモ",
    chooseFolder: "保存先フォルダを選択",
    saveToFolder: "📁 フォルダに保存",
    saveToFolderHelp: "選択したフォルダへ保存します",
    download: "⬇️ ダウンロード",
    downloadHelp: "ブラウザのダウンロードフォルダへ保存します",
    autoDownload: "作成後に自動ダウンロード",
    alsoSaveLog: "会話ログも保存する",
    downloadLog: "会話ログをダウンロード",
    downloadBoth: "両方ダウンロード",
    savedBothToFolder: (monthFolder: string, yamlFilename: string, sourceFilename: string) =>
      `${monthFolder}/${yamlFilename} と ${monthFolder}/${sourceFilename} に保存しました。`,
    destination: "保存先",
    selectedFolder: "選択済みフォルダ",
    notSelected: "未選択",
    selectedYamlPath: "選択済みフォルダ / YYYY-MM / filename.yaml",
    selectedMarkdownPath: "選択済みフォルダ / YYYY-MM / filename.source.md",
    downloadFallback: "未選択の場合はブラウザのダウンロードフォルダへ保存",
    folderUnsupportedHelp: "フォルダ指定に未対応のブラウザでは、ダウンロード保存を使います。",
    syncFolderHelp:
      "Google Driveなどの同期フォルダへ保存する場合、フォルダ保存が失敗することがあります。その場合は「ダウンロード」を使い、ブラウザの保存先をGoogle Drive同期フォルダに設定してください。",
    outputPreview: "出力プレビュー",
    yamlOutputTab: "知識メモ（YAML）",
    sourceOutputTab: "会話ログ（Markdown）",
    yamlOutputPlaceholder: "生成された知識メモがここに表示されます",
    sourceOutputPlaceholder: "生成された会話ログがここに表示されます",
    emptyContent: EMPTY_CONTENT_MESSAGE,
    folderSaveFailure: FOLDER_SAVE_FAILURE_MESSAGE,
    zeroByteWarning: ZERO_BYTE_WARNING_MESSAGE,
    promptCopied: (label: string) => `${label}しおりプロンプトをコピーしました。`,
    promptCopyFailed: "しおりプロンプトのコピーに失敗しました。",
    memoUpdated: "知識メモを更新しました。",
    logUpdated: "会話ログを更新しました。",
    pasteMemoToUpdate: "読み込む知識メモを貼り付けてください。",
    pasteLogToUpdate: "読み込む会話ログを貼り付けてください。",
    pasteLogToCreate: "会話ログを貼り付けてください。",
    folderUnsupported: "このブラウザではフォルダ保存に未対応です。ダウンロード保存を使ってください。",
    folderChosen: "保存先フォルダを選択し、次回起動用に保存しました。",
    folderCanceled: "フォルダ選択をキャンセルしました。",
    folderRestored: "保存先フォルダを復元しました。",
    folderRestoredNeedsPermission: "保存先フォルダを復元しました。保存時にアクセス許可が必要です。",
    folderRestoreFailed: "保存先フォルダの復元に失敗しました。",
    folderPermissionDenied: "保存先フォルダへのアクセスが許可されていません。",
    generated: "知識メモを生成しました。",
    autoDownloaded: "自動ダウンロードしました。",
    downloadReady: "ダウンロードボタンが使えます。",
    savedTo: (path: string) => `${path} に保存しました。`,
    logDownloaded: "会話ログをダウンロードしました。",
    memoDownloaded: "知識メモをダウンロードしました。",
    bothDownloaded: "知識メモと会話ログをダウンロードしました。",
    memoDownloadedNoLog: "知識メモをダウンロードしました。会話ログはありません。",
    createOrPasteFirst: "先に知識メモを生成または貼り付けてください。",
    noLog: "会話ログがありません。先に会話ログを生成してください。",
    sampleLog: `ユーザー:
AIとの会話を後で見返せる知識資産として残したい。
決定事項と次の行動を上に置きたい。
共通項目は固定し、用途依存の項目は拡張ブロックに分けたい。
事業家なら business_opportunities、研究者なら research_questions、発信者なら content_ideas を使えるようにしたい。
会話ログそのものではなく、再利用価値のある成果物を保存する仕組みにしたい。`,
  },
  en: {
    language: "Language",
    japanese: "Japanese",
    english: "English",
    appTitle: "AI Conversation Archive",
    tabMemoSave: "Knowledge Memo Save (YAML)",
    tabLogSave: "Conversation Log Save (Markdown)",
    tabPrompt: "Bookmark Prompt",
    tabMemoCreate: "Create Knowledge Memo",
    memoSaveTitle: "Knowledge Memo Save (YAML)",
    memoSaveDescription:
      "Paste a knowledge memo generated by ChatGPT, Claude, Gemini, or another AI. If you enter conversation_title, it saves as YYYY-MM-DD_conversation-title.yaml.",
    memoSavePlaceholder: "filename: example.yaml",
    logSaveTitle: "Conversation Log Save (Markdown)",
    logSaveDescription:
      "Paste a conversation log generated by ChatGPT, Claude, Gemini, or another AI. It is saved as a .md Markdown file.",
    logSavePlaceholder: "# Source Conversation",
    update: "Update",
    promptTitle: "Bookmark Prompt",
    promptDescription: "Copy the simple daily-use prompt or the full prompt for detailed archive workflows.",
    simple: "Simple",
    full: "Full",
    copyPrompt: (label: string) => `Copy ${label}`,
    memoCreateTitle: "Create Knowledge Memo",
    memoCreateDescription:
      "Paste a conversation log, personal note, idea memo, draft, or design note and convert it into a reusable knowledge memo.",
    memoCreatePlaceholder: "Paste content to convert into a knowledge memo",
    createMemo: "Create Knowledge Memo",
    sampleInput: "Use Sample",
    filename: "filename",
    status: "status",
    standby: "Ready",
    saveInfo: "Save Metadata",
    saveInfoDescription: "Information that helps you find the original chat later. conversation_title is also used for the filename.",
    titleFilenameHelp: "Also used for the filename.",
    sourceTitlePlaceholder: "AI Conversation Archive Design",
    conversationUrlHelp: "Original chat URL (optional)",
    bookmarkHelp: "Record what you want to remember from this conversation.",
    bookmarkPlaceholder: "A bookmark note to help you remember what this chat was about",
    chooseFolder: "Choose Save Folder",
    saveToFolder: "📁 Save to Folder",
    saveToFolderHelp: "Save to the selected folder",
    download: "⬇️ Download",
    downloadHelp: "Save using the browser download folder",
    autoDownload: "Download automatically after creation",
    alsoSaveLog: "Also save conversation log",
    downloadLog: "Download Conversation Log",
    downloadBoth: "Download Both",
    savedBothToFolder: (monthFolder: string, yamlFilename: string, sourceFilename: string) =>
      `Saved to ${monthFolder}/${yamlFilename} and ${monthFolder}/${sourceFilename}.`,
    destination: "Save Destination",
    selectedFolder: "Selected folder",
    notSelected: "Not selected",
    selectedYamlPath: "Selected folder / YYYY-MM / filename.yaml",
    selectedMarkdownPath: "Selected folder / YYYY-MM / filename.md",
    downloadFallback: "If no folder is selected, files are saved to the browser download folder",
    folderUnsupportedHelp: "If your browser does not support folder selection, use download instead.",
    syncFolderHelp:
      "Saving directly to synced folders such as Google Drive can fail. If that happens, use Download and set your browser download location to the synced folder.",
    outputPreview: "Output Preview",
    yamlOutputTab: "Knowledge Memo (YAML)",
    sourceOutputTab: "Conversation Log (Markdown)",
    yamlOutputPlaceholder: "Generated knowledge memo appears here",
    sourceOutputPlaceholder: "Generated conversation log appears here",
    emptyContent: "There is no content to save. Load YAML or Markdown before saving.",
    folderSaveFailure: [
      "Folder save failed.",
      "",
      "Browser folder saving may not write correctly to synced or mounted folders such as Google Drive / OneDrive / iCloud Drive.",
      "",
      "A 0 byte file may remain. If that happens, delete it and use browser Download instead.",
    ].join("\n"),
    zeroByteWarning: [
      "The saved file appears to be 0 bytes.",
      "",
      "Synced or mounted folders such as Google Drive / OneDrive / iCloud Drive may fail to finish writing.",
      "Delete the 0 byte file and use browser Download instead.",
    ].join("\n"),
    promptCopied: (label: string) => `${label} bookmark prompt copied.`,
    promptCopyFailed: "Failed to copy bookmark prompt.",
    memoUpdated: "Knowledge memo updated.",
    logUpdated: "Conversation log updated.",
    pasteMemoToUpdate: "Paste a knowledge memo to update.",
    pasteLogToUpdate: "Paste a conversation log to update.",
    pasteLogToCreate: "Paste content first.",
    folderUnsupported: "This browser does not support folder saving. Use Download instead.",
    folderChosen: "Save folder selected and stored for next launch.",
    folderCanceled: "Folder selection was canceled.",
    folderRestored: "Save folder restored.",
    folderRestoredNeedsPermission: "Save folder restored. Permission is required when saving.",
    folderRestoreFailed: "Failed to restore the save folder.",
    folderPermissionDenied: "Save folder access was not granted.",
    generated: "Knowledge memo generated.",
    autoDownloaded: "Auto-downloaded.",
    downloadReady: "Download button is available.",
    savedTo: (path: string) => `Saved to ${path}.`,
    logDownloaded: "Conversation log downloaded.",
    memoDownloaded: "Knowledge memo downloaded.",
    bothDownloaded: "Knowledge memo and conversation log downloaded.",
    memoDownloadedNoLog: "Knowledge memo downloaded. No conversation log is available.",
    createOrPasteFirst: "Create or paste a knowledge memo first.",
    noLog: "No conversation log available. Generate one first.",
    sampleLog: `User:
I want to preserve AI conversations as knowledge assets that can be reviewed later.
I want decisions and next actions near the top.
Common fields should be fixed, and use-case specific fields should be extension blocks.
For entrepreneurs, use business_opportunities; for researchers, use research_questions; for creators, use content_ideas.
The goal is not to save the raw conversation, but to preserve reusable outcomes.`,
  },
} as const;

function assertNonEmptyContent(content: string) {
  if (!content.trim()) {
    throw new Error("Cannot save empty archive content.");
  }
}

function downloadTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  assertNonEmptyContent(content);
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadYaml(filename: string, yamlText: string) {
  downloadTextFile(filename, yamlText, "text/yaml;charset=utf-8");
}

function buildBaseFilename(yamlContent: string, sourceInfo: SourceInfo, fallbackDate = new Date()) {
  const conversationTitle = sourceInfo.conversationTitle.trim();
  if (conversationTitle) {
    return stripArchiveFilenameExtension(buildConversationTitleFilename(conversationTitle, getFilenameDate(sourceInfo)));
  }
  return stripArchiveFilenameExtension(getYamlDownloadFilename(yamlContent, fallbackDate));
}

function buildYamlContent(sourceYamlText: string, sourceInfo: SourceInfo) {
  const content = mergeSourceMetadataIntoYaml(sourceYamlText, sourceInfo);
  assertNonEmptyContent(content);
  return content;
}

function buildMarkdownContent(sourceMarkdownText: string, sourceInfo: SourceInfo) {
  const content = mergeSourceMetadataIntoMarkdown(sourceMarkdownText, sourceInfo);
  assertNonEmptyContent(content);
  return content;
}

function buildYamlFile(sourceYamlText: string, sourceInfo: SourceInfo): PreparedTextFile {
  const content = buildYamlContent(sourceYamlText, sourceInfo);
  const baseFilename = buildBaseFilename(content, sourceInfo);
  return {
    filename: buildArchiveFilename(baseFilename, ".yaml"),
    content,
    mimeType: "text/yaml;charset=utf-8",
  };
}

function buildMarkdownFile(sourceMarkdownText: string, sourceInfo: SourceInfo, yamlContent = ""): PreparedTextFile {
  const content = buildMarkdownContent(sourceMarkdownText, sourceInfo);
  const baseFilename = sourceInfo.conversationTitle.trim()
    ? stripArchiveFilenameExtension(buildConversationTitleFilename(sourceInfo.conversationTitle, getFilenameDate(sourceInfo)))
    : yamlContent
      ? buildBaseFilename(yamlContent, sourceInfo)
      : stripArchiveFilenameExtension(getSourceOnlyDownloadFilename());
  return {
    filename: buildArchiveFilename(baseFilename, ".source.md"),
    content,
    mimeType: "text/markdown;charset=utf-8",
  };
}

function openDirectoryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DIRECTORY_STORE_NAME);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveDirectoryHandle(handle: WritableDirectoryHandle) {
  const database = await openDirectoryDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.put(handle, DIRECTORY_HANDLE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function loadDirectoryHandle() {
  const database = await openDirectoryDatabase();
  return new Promise<WritableDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_STORE_NAME, "readonly");
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.get(DIRECTORY_HANDLE_KEY);
    request.onsuccess = () => {
      database.close();
      resolve((request.result as WritableDirectoryHandle | undefined) ?? null);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getDirectoryPermission(handle: WritableDirectoryHandle) {
  if (!handle.queryPermission) return "granted";
  return handle.queryPermission({ mode: "readwrite" });
}

async function ensureDirectoryPermission(handle: WritableDirectoryHandle) {
  const currentPermission = await getDirectoryPermission(handle);
  if (currentPermission === "granted") return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

function formatMarkdownTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatSourceTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function buildSourceMetadata(sourceInfo: SourceInfo) {
  const source: Record<string, string> = {};
  if (sourceInfo.platform.trim()) source.platform = sourceInfo.platform.trim();
  if (sourceInfo.conversationTitle.trim()) source.conversation_title = sourceInfo.conversationTitle.trim();
  if (sourceInfo.conversationUrl.trim()) source.conversation_url = sourceInfo.conversationUrl.trim();
  if (sourceInfo.savedAt.trim()) source.saved_at = sourceInfo.savedAt.trim();
  return source;
}

function buildBookmarkMetadata(sourceInfo: SourceInfo) {
  if (!sourceInfo.bookmark.trim()) return null;
  return {
    summary: sourceInfo.bookmark.trim(),
  };
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function extractSourceInfoFromYaml(yamlText: string) {
  try {
    const parsed = yaml.load(yamlText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const parsedRecord = parsed as Record<string, unknown>;
    const source =
      parsedRecord.source && typeof parsedRecord.source === "object" && !Array.isArray(parsedRecord.source)
        ? (parsedRecord.source as Record<string, unknown>)
        : {};
    const bookmark =
      parsedRecord.bookmark && typeof parsedRecord.bookmark === "object" && !Array.isArray(parsedRecord.bookmark)
        ? (parsedRecord.bookmark as Record<string, unknown>)
        : {};
    const extracted: Partial<SourceInfo> = {};
    const platform = getStringField(source.platform);
    const savedAt = getStringField(source.saved_at);
    const conversationTitle = getStringField(source.conversation_title) || getStringField(source.title);
    const conversationUrl = getStringField(source.conversation_url);
    const bookmarkText = getStringField(bookmark.summary) || getStringField(source.user_note);

    if (platform) extracted.platform = platform;
    if (savedAt) extracted.savedAt = savedAt;
    if (conversationTitle) extracted.conversationTitle = conversationTitle;
    if (conversationUrl) extracted.conversationUrl = conversationUrl;
    if (bookmarkText) extracted.bookmark = bookmarkText;
    return extracted;
  } catch {
    return {};
  }
}

function getFilenameDate(sourceInfo: SourceInfo) {
  const match = sourceInfo.savedAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getConversationTitleFilename(sourceInfo: SourceInfo) {
  if (!sourceInfo.conversationTitle.trim()) return "";
  return buildConversationTitleFilename(sourceInfo.conversationTitle, getFilenameDate(sourceInfo));
}

function sourceMetadataLines(sourceInfo: SourceInfo) {
  const source = buildSourceMetadata(sourceInfo);
  const lines = [`saved_at: ${source.saved_at ?? formatSourceTimestamp()}`];
  if (source.platform) lines.push(`platform: ${source.platform}`);
  if (source.conversation_title) lines.push(`conversation_title: ${source.conversation_title}`);
  if (source.conversation_url) lines.push(`conversation_url: ${source.conversation_url}`);
  if (sourceInfo.bookmark.trim()) lines.push("", "bookmark:", sourceInfo.bookmark.trim());
  return lines;
}

function mergeSourceMetadataIntoYaml(yamlText: string, sourceInfo: SourceInfo) {
  const sourceMetadata = buildSourceMetadata(sourceInfo);
  const bookmarkMetadata = buildBookmarkMetadata(sourceInfo);

  try {
    const parsed = yaml.load(yamlText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return yamlText;
    const parsedRecord = parsed as Record<string, unknown>;
    const existingSource = {
      ...("source" in parsedRecord &&
      parsedRecord.source &&
      typeof parsedRecord.source === "object" &&
      !Array.isArray(parsedRecord.source)
        ? (parsedRecord.source as Record<string, unknown>)
        : {}),
    };
    const legacyConversationTitle = typeof existingSource.title === "string" ? existingSource.title.trim() : "";
    const legacyBookmark = typeof existingSource.user_note === "string" ? existingSource.user_note.trim() : "";
    delete existingSource.title;
    delete existingSource.user_note;

    const nextSourceMetadata = {
      ...sourceMetadata,
      ...(!sourceMetadata.conversation_title && legacyConversationTitle
        ? { conversation_title: legacyConversationTitle }
        : {}),
    };
    const nextBookmarkMetadata =
      bookmarkMetadata ??
      (legacyBookmark
        ? {
            summary: legacyBookmark,
          }
        : null);
    const filenameTitle =
      sourceInfo.conversationTitle.trim() ||
      (typeof nextSourceMetadata.conversation_title === "string" ? nextSourceMetadata.conversation_title : "");
    const conversationTitleFilename = filenameTitle
      ? buildConversationTitleFilename(filenameTitle, getFilenameDate(sourceInfo))
      : "";
    const hasMetadataUpdate =
      Object.keys(nextSourceMetadata).length > 0 || nextBookmarkMetadata || conversationTitleFilename || legacyConversationTitle || legacyBookmark;
    if (!hasMetadataUpdate) return yamlText;

    const existingBookmark =
      "bookmark" in parsedRecord &&
      parsedRecord.bookmark &&
      typeof parsedRecord.bookmark === "object" &&
      !Array.isArray(parsedRecord.bookmark)
        ? (parsedRecord.bookmark as Record<string, unknown>)
        : {};
    return yaml.dump(
      {
        ...parsedRecord,
        ...(conversationTitleFilename ? { filename: conversationTitleFilename } : {}),
        source: {
          ...existingSource,
          ...nextSourceMetadata,
        },
        ...(nextBookmarkMetadata
          ? {
              bookmark: {
                ...existingBookmark,
                ...nextBookmarkMetadata,
              },
            }
          : {}),
      },
      {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        sortKeys: false,
      },
    );
  } catch {
    return yamlText;
  }
}

function mergeSourceMetadataIntoMarkdown(markdownText: string, sourceInfo: SourceInfo) {
  const sourceLines = sourceMetadataLines(sourceInfo);
  const normalized = markdownText.trimStart();
  if (normalized.startsWith("# Source Conversation")) {
    const [, ...rest] = normalized.split("\n");
    let index = 0;
    let consumedMetadata = false;

    while (index < rest.length && !rest[index].trim()) index += 1;
    while (index < rest.length) {
      const line = rest[index].trim();
      if (/^(saved_at|platform|conversation_title|conversation_url):/.test(line)) {
        consumedMetadata = true;
        index += 1;
        continue;
      }
      if (line === "bookmark:") {
        consumedMetadata = true;
        index += 1;
        while (index < rest.length && rest[index].trim()) index += 1;
        continue;
      }
      if (!line && consumedMetadata) {
        index += 1;
        break;
      }
      break;
    }

    const contentLines = consumedMetadata ? rest.slice(index) : rest;
    return ["# Source Conversation", "", ...sourceLines, "", ...contentLines].join("\n").trimEnd() + "\n";
  }
  return ["# Source Conversation", "", ...sourceLines, "", normalized].join("\n").trimEnd() + "\n";
}

function getSourceOnlyDownloadFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}_source-conversation.source.md`;
}

async function warnIfWrittenFileIsEmpty(fileHandle: { getFile?: () => Promise<File> }) {
  if (!fileHandle.getFile) return false;
  try {
    const file = await fileHandle.getFile();
    return file.size === 0;
  } catch {
    return false;
  }
}

async function saveTextFileToDirectory(
  directory: WritableDirectoryHandle,
  filename: string,
  content: string,
  monthFolder: string,
) {
  assertNonEmptyContent(content);
  const monthDirectory = await directory.getDirectoryHandle(monthFolder, { create: true });
  const fileHandle = await monthDirectory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return warnIfWrittenFileIsEmpty(fileHandle);
}

export default function HandoffMemoTool() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "ja";
    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return savedLanguage === "en" || savedLanguage === "ja" ? savedLanguage : "ja";
  });
  const [activeInputTab, setActiveInputTab] = useState<InputTab>("memo-save");
  const [conversationLog, setConversationLog] = useState("");
  const [memo, setMemo] = useState<HandoffMemo | null>(null);
  const [yamlText, setYamlText] = useState("");
  const [directoryHandle, setDirectoryHandle] = useState<WritableDirectoryHandle | null>(null);
  const [directoryName, setDirectoryName] = useState("");
  const [status, setStatus] = useState("");
  const [autoDownload, setAutoDownload] = useState(false);
  const [saveSourceLog, setSaveSourceLog] = useState(true);
  const [sourceLogText, setSourceLogText] = useState("");
  const [sourceLogFilename, setSourceLogFilename] = useState("");
  const [activeOutputTab, setActiveOutputTab] = useState<OutputTab>("yaml");
  const [activePromptVariant, setActivePromptVariant] = useState<PromptVariant>("simple");
  const [sourceInfo, setSourceInfo] = useState<SourceInfo>(() => ({
    platform: "ChatGPT",
    conversationTitle: "",
    conversationUrl: "",
    savedAt: formatSourceTimestamp(),
    bookmark: "",
  }));
  const t = UI_TEXT[language];
  const conversationTitleFilename = getConversationTitleFilename(sourceInfo);
  const previewYamlText = yamlText ? mergeSourceMetadataIntoYaml(yamlText, sourceInfo) : "";
  const currentYamlFilename = previewYamlText ? getYamlDownloadFilename(previewYamlText) : "";
  const currentSourceLogFilename = conversationTitleFilename
    ? getSourceLogFilenameFromYamlFilename(conversationTitleFilename)
    : sourceLogFilename || getSourceOnlyDownloadFilename();
  const activeFilename =
    activeInputTab === "log-save"
      ? currentSourceLogFilename
      : currentYamlFilename || conversationTitleFilename || memo?.filename || t.standby;
  const canDownloadSourceLog = Boolean(sourceLogText.trim());
  const canDownloadBoth = Boolean(yamlText.trim() && sourceLogText.trim());
  const activePrompt =
    activePromptVariant === "simple"
      ? language === "en"
        ? SIMPLE_SHIORI_ARCHIVE_PROMPT_EN
        : SIMPLE_SHIORI_ARCHIVE_PROMPT
      : language === "en"
        ? SHIORI_ARCHIVE_PROMPT_EN
        : SHIORI_ARCHIVE_PROMPT;
  const activePromptLabel = activePromptVariant === "simple" ? t.simple : t.full;

  function selectInputTab(tab: InputTab) {
    setActiveInputTab(tab);
    setActiveOutputTab(tab === "log-save" ? "source" : "yaml");
  }

  function updateSourceInfo(field: keyof SourceInfo, value: string) {
    setSourceInfo((current) => ({
      ...current,
      [field]: value,
    }));
    if (yamlText.trim()) {
      const nextSourceInfo = {
        ...sourceInfo,
        [field]: value,
      };
      setYamlText(mergeSourceMetadataIntoYaml(yamlText, nextSourceInfo));
    }
  }

  function syncSourceInfoFromYaml(nextYamlText: string) {
    const extractedSourceInfo = extractSourceInfoFromYaml(nextYamlText);
    if (Object.keys(extractedSourceInfo).length === 0) return;
    setSourceInfo((current) => ({
      ...current,
      ...extractedSourceInfo,
    }));
  }

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    let isMounted = true;

    async function restoreDirectory() {
      if (!("indexedDB" in window)) return;

      try {
        const savedHandle = await loadDirectoryHandle();
        if (!savedHandle || !isMounted) return;

        setDirectoryHandle(savedHandle);
        setDirectoryName(savedHandle.name ?? t.selectedFolder);

        const permission = await getDirectoryPermission(savedHandle);
        if (!isMounted) return;
        setStatus(
          permission === "granted"
            ? t.folderRestored
            : t.folderRestoredNeedsPermission,
        );
      } catch {
        if (isMounted) setStatus(t.folderRestoreFailed);
      }
    }

    restoreDirectory();

    return () => {
      isMounted = false;
    };
  }, [t.folderRestoreFailed, t.folderRestored, t.folderRestoredNeedsPermission, t.selectedFolder]);

  function finishGeneration(nextMemo: HandoffMemo, nextYaml: string, message: string, nextSourceLog = "") {
    setMemo(nextMemo);
    setYamlText(nextYaml);
    setSourceLogText(nextSourceLog);
    setSourceLogFilename(nextSourceLog ? getSourceLogDownloadFilename(nextYaml) : "");
    setActiveOutputTab("yaml");

    if (autoDownload) {
      downloadYaml(getYamlDownloadFilename(nextYaml), nextYaml);
      setStatus(`${message} ${t.autoDownloaded}`);
      return;
    }

    setStatus(`${message} ${t.downloadReady}`);
  }

  function buildSourceLogMarkdown(params: {
    sourceInfo: SourceInfo;
    messages: ChatMessage[];
  }) {
    const lines = [
      "# Source Conversation",
      "",
      ...sourceMetadataLines(params.sourceInfo),
      "",
    ];

    params.messages.forEach((message, index) => {
      lines.push(`[${String(index + 1).padStart(3, "0")}] ${message.role}`);
      lines.push(message.text);
      lines.push("");
    });

    return lines.join("\n");
  }

  function bulkMessages(source: string): ChatMessage[] {
    return [
      {
        id: 1,
        role: "user",
        text: source,
      },
    ];
  }

  function buildBulkMemo(source: string) {
    const createdAt = new Date();
    const sourceMetadata = buildSourceMetadata(sourceInfo);
    const draftMemo = generateHandoffMemo(source, createdAt, {
      source: {
        source_mode: "bulk-convert",
        ...sourceMetadata,
        captured_range: {
          before_messages: source.split(/\n+/).filter(Boolean).length,
          after_messages: 0,
        },
      },
    });
    const sourceLogFile = saveSourceLog ? getSourceLogFilenameFromYamlFilename(draftMemo.filename) : null;
    const nextMemo = generateHandoffMemo(source, createdAt, {
      source: {
        source_mode: "bulk-convert",
        source_log_file: sourceLogFile,
        ...sourceMetadata,
        captured_range: {
          before_messages: source.split(/\n+/).filter(Boolean).length,
          after_messages: 0,
        },
      },
    });
    const nextYaml = memoToYaml(nextMemo);
    const nextSourceLog = saveSourceLog
      ? buildSourceLogMarkdown({
          sourceInfo: {
            ...sourceInfo,
            savedAt: sourceInfo.savedAt || formatSourceTimestamp(createdAt),
          },
          messages: bulkMessages(source),
        })
      : "";

    return { nextMemo, nextYaml, nextSourceLog };
  }

  function generate() {
    const source = conversationLog.trim();
    if (!source) {
      setStatus(t.pasteLogToCreate);
      return;
    }

    const { nextMemo, nextYaml, nextSourceLog } = buildBulkMemo(source);
    finishGeneration(nextMemo, nextYaml, t.generated, nextSourceLog);
  }

  async function chooseDirectory() {
    if (!window.showDirectoryPicker) {
      setStatus(t.folderUnsupported);
      return;
    }

    try {
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      setDirectoryName(handle.name ?? t.selectedFolder);
      await saveDirectoryHandle(handle);
      setStatus(t.folderChosen);
    } catch {
      setStatus(t.folderCanceled);
    }
  }

  function loadCurrentInput() {
    if (activeInputTab === "memo-save") {
      if (!yamlText.trim()) {
        setStatus(t.pasteMemoToUpdate);
        return;
      }
      const extractedSourceInfo = extractSourceInfoFromYaml(yamlText);
      const nextSourceInfo = {
        ...sourceInfo,
        ...extractedSourceInfo,
      };
      setMemo(null);
      setSourceInfo(nextSourceInfo);
      setYamlText(mergeSourceMetadataIntoYaml(yamlText, nextSourceInfo));
      setActiveOutputTab("yaml");
      setStatus(t.memoUpdated);
      return;
    }

    if (activeInputTab === "log-save") {
      if (!sourceLogText.trim()) {
        setStatus(t.pasteLogToUpdate);
        return;
      }
      setSourceLogFilename((filename) => filename || getSourceOnlyDownloadFilename());
      setActiveOutputTab("source");
      setStatus(t.logUpdated);
      return;
    }

    generate();
  }

  async function saveSourceLogFile() {
    if (!sourceLogText.trim()) {
      setStatus(t.emptyContent);
      return;
    }

    let markdownFile: PreparedTextFile;
    try {
      markdownFile = buildMarkdownFile(sourceLogText, sourceInfo);
    } catch {
      setStatus(t.emptyContent);
      return;
    }

    const monthFolder = formatSourceTimestamp(getFilenameDate(sourceInfo)).slice(0, 7);
    if (directoryHandle) {
      try {
        if (!(await ensureDirectoryPermission(directoryHandle))) {
          setStatus(t.folderPermissionDenied);
          return;
        }
        const isEmptyFile = await saveTextFileToDirectory(
          directoryHandle,
          markdownFile.filename,
          markdownFile.content,
          monthFolder,
        );
        if (isEmptyFile) {
          setStatus(t.zeroByteWarning);
          return;
        }
        setSourceLogText(markdownFile.content);
        setSourceLogFilename(markdownFile.filename);
        setStatus(t.savedTo(`${monthFolder}/${markdownFile.filename}`));
        return;
      } catch {
        setStatus(t.folderSaveFailure);
        return;
      }
    }

    try {
      downloadTextFile(markdownFile.filename, markdownFile.content, markdownFile.mimeType);
    } catch {
      setStatus(t.emptyContent);
      return;
    }
    setSourceLogText(markdownFile.content);
    setSourceLogFilename(markdownFile.filename);
    setStatus(t.logDownloaded);
  }

  async function save() {
    if (activeInputTab === "log-save" && !yamlText.trim()) {
      await saveSourceLogFile();
      return;
    }

    if (!yamlText.trim() && !sourceLogText.trim() && (activeInputTab === "memo-save" || !conversationLog.trim())) {
      setStatus(t.emptyContent);
      return;
    }

    let nextMemo = activeInputTab === "memo-save" ? null : memo;
    let nextYaml = yamlText;
    let nextSourceLogText = sourceLogText;
    const isPastedYaml = activeInputTab === "memo-save";

    if (!nextYaml.trim()) {
      if (isPastedYaml) {
        setStatus(t.emptyContent);
        return;
      }
      if (!conversationLog.trim()) {
        setStatus(t.emptyContent);
        return;
      }
      const generated = buildBulkMemo(conversationLog.trim());
      nextMemo = generated.nextMemo;
      nextYaml = generated.nextYaml;
      nextSourceLogText = generated.nextSourceLog;
      setSourceLogText(generated.nextSourceLog);
      setSourceLogFilename(generated.nextSourceLog ? getSourceLogDownloadFilename(nextYaml) : "");
      setMemo(nextMemo);
      setYamlText(nextYaml);
    }

    let yamlFile: PreparedTextFile;
    let markdownFile: PreparedTextFile | null = null;
    try {
      yamlFile = buildYamlFile(nextYaml, sourceInfo);
      if (nextSourceLogText.trim()) {
        markdownFile = buildMarkdownFile(nextSourceLogText, sourceInfo, yamlFile.content);
      }
    } catch {
      setStatus(t.emptyContent);
      return;
    }

    if (directoryHandle) {
      try {
        if (!(await ensureDirectoryPermission(directoryHandle))) {
          setStatus(t.folderPermissionDenied);
          return;
        }
        const monthFolder = nextMemo ? getMemoMonthFolder(nextMemo) : formatMarkdownTimestamp().slice(0, 7);
        const isEmptyFile = await saveTextFileToDirectory(
          directoryHandle,
          yamlFile.filename,
          yamlFile.content,
          monthFolder,
        );
        if (isEmptyFile) {
          setYamlText(yamlFile.content);
          setStatus(t.zeroByteWarning);
          return;
        }
        setYamlText(yamlFile.content);
        if (markdownFile) {
          const isSourceEmptyFile = await saveTextFileToDirectory(
            directoryHandle,
            markdownFile.filename,
            markdownFile.content,
            monthFolder,
          );
          if (isSourceEmptyFile) {
            setStatus(t.zeroByteWarning);
            return;
          }
          setSourceLogText(markdownFile.content);
          setSourceLogFilename(markdownFile.filename);
          setStatus(t.savedBothToFolder(monthFolder, yamlFile.filename, markdownFile.filename));
          return;
        }
        setStatus(t.savedTo(`${monthFolder}/${yamlFile.filename}`));
        return;
      } catch {
        setStatus(t.folderSaveFailure);
        return;
      }
    }

    setYamlText(yamlFile.content);
    try {
      downloadTextFile(yamlFile.filename, yamlFile.content, yamlFile.mimeType);
    } catch {
      setStatus(t.emptyContent);
      return;
    }
    if (markdownFile) {
      setSourceLogText(markdownFile.content);
      setSourceLogFilename(markdownFile.filename);
      try {
        downloadTextFile(markdownFile.filename, markdownFile.content, markdownFile.mimeType);
      } catch {
        setStatus(t.emptyContent);
        return;
      }
      setStatus(t.bothDownloaded);
      return;
    }
    setStatus(t.memoDownloaded);
  }

  function download() {
    if (activeInputTab === "log-save") {
      downloadSourceLog();
      return;
    }

    if (!yamlText) {
      setStatus(t.createOrPasteFirst);
      return;
    }
    let yamlFile: PreparedTextFile;
    try {
      yamlFile = buildYamlFile(yamlText, sourceInfo);
      downloadTextFile(yamlFile.filename, yamlFile.content, yamlFile.mimeType);
    } catch {
      setStatus(t.emptyContent);
      return;
    }
    setYamlText(yamlFile.content);
    setStatus(t.memoDownloaded);
  }

  function downloadSourceLog() {
    if (!sourceLogText) {
      setStatus(t.noLog);
      return;
    }
    let markdownFile: PreparedTextFile;
    try {
      const yamlContent = yamlText.trim() ? buildYamlContent(yamlText, sourceInfo) : "";
      markdownFile = buildMarkdownFile(sourceLogText, sourceInfo, yamlContent);
      downloadTextFile(markdownFile.filename, markdownFile.content, markdownFile.mimeType);
    } catch {
      setStatus(t.emptyContent);
      return;
    }
    setSourceLogText(markdownFile.content);
    setSourceLogFilename(markdownFile.filename);
    setStatus(t.logDownloaded);
  }

  function downloadBoth() {
    if (!yamlText) {
      setStatus(t.createOrPasteFirst);
      return;
    }
    let yamlFile: PreparedTextFile;
    try {
      yamlFile = buildYamlFile(yamlText, sourceInfo);
      downloadTextFile(yamlFile.filename, yamlFile.content, yamlFile.mimeType);
    } catch {
      setStatus(t.emptyContent);
      return;
    }
    setYamlText(yamlFile.content);
    if (sourceLogText.trim()) {
      let markdownFile: PreparedTextFile;
      try {
        markdownFile = buildMarkdownFile(sourceLogText, sourceInfo, yamlFile.content);
        downloadTextFile(markdownFile.filename, markdownFile.content, markdownFile.mimeType);
      } catch {
        setStatus(t.emptyContent);
        return;
      }
      setSourceLogText(markdownFile.content);
      setSourceLogFilename(markdownFile.filename);
      setStatus(t.bothDownloaded);
      return;
    }
    setStatus(t.memoDownloadedNoLog);
  }

  async function copyShioriPrompt(promptText = activePrompt, promptLabel = activePromptLabel) {
    try {
      await navigator.clipboard.writeText(promptText);
      setStatus(t.promptCopied(promptLabel));
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = promptText;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        setStatus(copied ? t.promptCopied(promptLabel) : t.promptCopyFailed);
      } catch {
        setStatus(t.promptCopyFailed);
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Reusable conversation archive</p>
            <h1 className="mt-1 text-xl font-bold">{t.appTitle}</h1>
          </div>
          <div>
            <p className="text-xs font-semibold text-stone-500">{t.language}</p>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-md border border-stone-300 bg-stone-100 p-1">
              {([
                ["ja", t.japanese],
                ["en", t.english],
              ] as const).map(([nextLanguage, label]) => (
                <button
                  key={nextLanguage}
                  type="button"
                  onClick={() => setLanguage(nextLanguage)}
                  className={`h-9 rounded px-3 text-sm font-bold ${
                    language === nextLanguage ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="space-y-4">
          <div className="rounded-md border border-stone-200 bg-white p-4">
            <div className="grid gap-1 rounded-md border border-stone-300 bg-stone-100 p-1 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ["memo-save", t.tabMemoSave],
                ["log-save", t.tabLogSave],
                ["prompt", t.tabPrompt],
                ["memo-create", t.tabMemoCreate],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => selectInputTab(tab)}
                  className={`min-h-10 rounded px-3 py-2 text-sm font-bold ${
                    activeInputTab === tab ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeInputTab === "memo-save" && (
              <div className="mt-4">
                <label htmlFor="memo-save-input" className="text-sm font-bold">
                  {t.memoSaveTitle}
                </label>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {t.memoSaveDescription}
                </p>
                <textarea
                  id="memo-save-input"
                  value={yamlText}
                  onChange={(event) => {
                    const nextYamlText = event.target.value;
                    setYamlText(nextYamlText);
                    syncSourceInfoFromYaml(nextYamlText);
                    setMemo(null);
                    setActiveOutputTab("yaml");
                  }}
                  className="mt-2 min-h-[430px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  placeholder={t.memoSavePlaceholder}
                  spellCheck={false}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={loadCurrentInput}
                    className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    {t.update}
                  </button>
                </div>
              </div>
            )}

            {activeInputTab === "log-save" && (
              <div className="mt-4">
                <label htmlFor="log-save-input" className="text-sm font-bold">
                  {t.logSaveTitle}
                </label>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {t.logSaveDescription}
                </p>
                <textarea
                  id="log-save-input"
                  value={sourceLogText}
                  onChange={(event) => {
                    setSourceLogText(event.target.value);
                    setSourceLogFilename((filename) => filename || getSourceOnlyDownloadFilename());
                    setActiveOutputTab("source");
                  }}
                  className="mt-2 min-h-[430px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  placeholder={t.logSavePlaceholder}
                  spellCheck={false}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={loadCurrentInput}
                    className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    {t.update}
                  </button>
                </div>
              </div>
            )}

            {activeInputTab === "prompt" && (
              <div className="mt-4 rounded-md border border-teal-100 bg-teal-50 p-4">
                <p className="text-sm font-bold text-stone-950">{t.promptTitle}</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {t.promptDescription}
                </p>
                <div className="mt-3 grid gap-1 rounded-md border border-teal-200 bg-white p-1 sm:grid-cols-2">
                  {([
                    ["simple", t.simple],
                    ["full", t.full],
                  ] as const).map(([variant, label]) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => setActivePromptVariant(variant)}
                      className={`h-10 rounded px-3 text-sm font-bold ${
                        activePromptVariant === variant ? "bg-teal-700 text-white" : "text-stone-600 hover:bg-teal-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => copyShioriPrompt()}
                  className="mt-3 h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                >
                  {t.copyPrompt(activePromptLabel)}
                </button>
                <textarea
                  value={activePrompt}
                  readOnly
                  className="mt-3 min-h-[430px] w-full resize-y rounded-md border border-teal-200 bg-white p-4 font-mono text-xs leading-5 text-stone-800 outline-none"
                  spellCheck={false}
                />
                <p className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-5 text-stone-600">{status || t.standby}</p>
              </div>
            )}

            {activeInputTab === "memo-create" && (
              <div className="mt-4">
                <label htmlFor="conversation-log" className="text-sm font-bold">
                  {t.memoCreateTitle}
                </label>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {t.memoCreateDescription}
                </p>
                <textarea
                  id="conversation-log"
                  value={conversationLog}
                  onChange={(event) => setConversationLog(event.target.value)}
                  className="mt-2 min-h-[430px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  placeholder={t.memoCreatePlaceholder}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={generate}
                    className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    {t.createMemo}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationLog(t.sampleLog)}
                    className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                  >
                    {t.sampleInput}
                  </button>
                </div>
              </div>
            )}
          </div>

          {activeInputTab !== "prompt" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-stone-200 bg-white p-4">
                <p className="text-xs font-semibold text-stone-500">{t.filename}</p>
                <p className="mt-2 break-words text-sm font-bold">{activeFilename}</p>
              </div>
              <div className="rounded-md border border-stone-200 bg-white p-4">
                <p className="text-xs font-semibold text-stone-500">{t.status}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6">{status || t.standby}</p>
              </div>
            </div>
          )}

          {activeInputTab !== "prompt" && (
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="text-sm font-bold text-stone-950">{t.saveInfo}</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {t.saveInfoDescription}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="source-platform" className="text-xs font-bold text-stone-600">
                    platform
                  </label>
                  <input
                    id="source-platform"
                    value={sourceInfo.platform}
                    onChange={(event) => updateSourceInfo("platform", event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                    placeholder="ChatGPT"
                  />
                </div>
                <div>
                  <label htmlFor="source-saved-at" className="text-xs font-bold text-stone-600">
                    saved_at
                  </label>
                  <input
                    id="source-saved-at"
                    value={sourceInfo.savedAt}
                    onChange={(event) => updateSourceInfo("savedAt", event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                    placeholder="2026-06-19 08:57"
                  />
                </div>
                <div>
                  <label htmlFor="source-title" className="text-xs font-bold text-stone-600">
                    conversation_title
                  </label>
                  <input
                    id="source-title"
                    value={sourceInfo.conversationTitle}
                    onChange={(event) => updateSourceInfo("conversationTitle", event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                    placeholder={t.sourceTitlePlaceholder}
                  />
                  <p className="mt-1 text-xs leading-5 text-stone-500">{t.titleFilenameHelp}</p>
                </div>
                <div>
                  <label htmlFor="source-url" className="text-xs font-bold text-stone-600">
                    conversation_url
                  </label>
                  <input
                    id="source-url"
                    value={sourceInfo.conversationUrl}
                    onChange={(event) => updateSourceInfo("conversationUrl", event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                    placeholder="https://chatgpt.com/c/..."
                  />
                  <p className="mt-1 text-xs leading-5 text-stone-500">{t.conversationUrlHelp}</p>
                </div>
              </div>
              <div className="mt-3">
                <label htmlFor="source-note" className="text-xs font-bold text-stone-600">
                  bookmark
                </label>
                <textarea
                  id="source-note"
                  value={sourceInfo.bookmark}
                  onChange={(event) => updateSourceInfo("bookmark", event.target.value)}
                  className="mt-1 min-h-20 w-full resize-y rounded-md border border-stone-300 bg-white p-3 text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  placeholder={t.bookmarkPlaceholder}
                />
                <p className="mt-1 text-xs leading-5 text-stone-500">{t.bookmarkHelp}</p>
              </div>
            </div>
          )}

          {activeInputTab !== "prompt" && (
            <div className="flex flex-wrap items-start gap-3">
              <button
                type="button"
                onClick={chooseDirectory}
                className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
              >
                {t.chooseFolder}
              </button>
              <div className="min-w-[180px]">
                <button
                  type="button"
                  onClick={save}
                  className="h-11 rounded-md bg-stone-950 px-5 text-sm font-bold text-white hover:bg-stone-800"
                >
                  {t.saveToFolder}
                </button>
                <p className="mt-1 text-xs font-medium text-stone-500">{t.saveToFolderHelp}</p>
              </div>
              <div className="min-w-[220px]">
                <button
                  type="button"
                  onClick={download}
                  className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                >
                  {t.download}
                </button>
                <p className="mt-1 text-xs font-medium text-stone-500">{t.downloadHelp}</p>
              </div>
              {activeInputTab === "memo-create" && (
                <label className="flex h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={autoDownload}
                    onChange={(event) => setAutoDownload(event.target.checked)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  {t.autoDownload}
                </label>
              )}
              {activeInputTab === "memo-create" && (
                <label className="flex h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={saveSourceLog}
                    onChange={(event) => setSaveSourceLog(event.target.checked)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  {t.alsoSaveLog}
                </label>
              )}
              {canDownloadSourceLog && (
                <>
                  <button
                    type="button"
                    onClick={downloadSourceLog}
                    className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                  >
                    {t.downloadLog}
                  </button>
                </>
              )}
              {canDownloadBoth && (
                <>
                  <button
                    type="button"
                    onClick={downloadBoth}
                    className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                  >
                    {t.downloadBoth}
                  </button>
                </>
              )}
            </div>
          )}

          {activeInputTab !== "prompt" && (
            <div className="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700">
              <p className="font-semibold text-stone-950">{t.destination}</p>
              <p className="mt-1 font-bold text-stone-950">
                {directoryHandle ? directoryName || t.selectedFolder : t.notSelected}
              </p>
              <p className="mt-1">
                {directoryHandle
                  ? activeInputTab === "log-save"
                    ? t.selectedMarkdownPath
                    : t.selectedYamlPath
                  : t.downloadFallback}
              </p>
              <p className="mt-2 text-stone-500">
                {t.folderUnsupportedHelp}
              </p>
              <p className="mt-2 text-stone-500">
                {t.syncFolderHelp}
              </p>
            </div>
          )}

        </section>

        <section className="space-y-4">
          <div>
            <label htmlFor="yaml-output" className="text-sm font-bold">
              {t.outputPreview}
            </label>
            <div className="mt-2 flex rounded-md border border-stone-300 bg-stone-100 p-1">
              {(["yaml", "source"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveOutputTab(tab)}
                  className={`h-9 flex-1 rounded px-3 text-sm font-bold ${
                    activeOutputTab === tab ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-white"
                  }`}
                >
                  {tab === "yaml" ? t.yamlOutputTab : t.sourceOutputTab}
                </button>
              ))}
            </div>
            <textarea
              id="yaml-output"
              value={activeOutputTab === "yaml" ? yamlText : sourceLogText}
              onChange={(event) => {
                if (activeOutputTab === "yaml") {
                  setYamlText(event.target.value);
                  return;
                }
                setSourceLogText(event.target.value);
              }}
              className="mt-2 min-h-[600px] w-full resize-y rounded-md border border-stone-300 bg-[#111827] p-4 font-mono text-sm leading-6 text-stone-50 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              placeholder={activeOutputTab === "yaml" ? t.yamlOutputPlaceholder : t.sourceOutputPlaceholder}
              spellCheck={false}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
