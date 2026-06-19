"use client";

import { useEffect, useState } from "react";
import yaml from "js-yaml";
import { SHIORI_ARCHIVE_PROMPT } from "@/lib/archivePrompt";
import {
  buildConversationTitleFilename,
  generateHandoffMemo,
  getMemoMonthFolder,
  getSourceLogDownloadFilename,
  getSourceLogFilenameFromYamlFilename,
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

const sampleLog = `ユーザー:
AIとの会話を後で見返せる知識資産として残したい。
決定事項と次の行動を上に置きたい。
共通項目は固定し、用途依存の項目は拡張ブロックに分けたい。
事業家なら business_opportunities、研究者なら research_questions、発信者なら content_ideas を使えるようにしたい。
会話ログそのものではなく、再利用価値のある成果物を保存する仕組みにしたい。`;

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

type OutputTab = "yaml" | "source";
type InputTab = "memo-save" | "log-save" | "prompt" | "memo-create";

type SourceInfo = {
  platform: string;
  conversationTitle: string;
  conversationUrl: string;
  savedAt: string;
  bookmark: string;
};

const DIRECTORY_DB_NAME = "ai-conversation-archive";
const DIRECTORY_STORE_NAME = "settings";
const DIRECTORY_HANDLE_KEY = "directoryHandle";
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

function downloadTextFile(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
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
    const contentStartIndex = rest.findIndex((line) => /^\[\d{3}\]\s/.test(line.trim()) || line.startsWith("# "));
    const contentLines = contentStartIndex >= 0 ? rest.slice(contentStartIndex) : rest;
    return ["# Source Conversation", "", ...sourceLines, "", ...contentLines].join("\n").trimEnd() + "\n";
  }
  return ["# Source Conversation", "", ...sourceLines, "", normalized].join("\n").trimEnd() + "\n";
}

function getSourceOnlyDownloadFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}_source-conversation.md`;
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

async function writeYamlToDirectory(directory: WritableDirectoryHandle, memo: HandoffMemo, yamlText: string) {
  const monthDirectory = await directory.getDirectoryHandle(getMemoMonthFolder(memo), { create: true });
  const fileHandle = await monthDirectory.getFileHandle(getYamlDownloadFilename(yamlText), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(yamlText);
  await writable.close();
  return warnIfWrittenFileIsEmpty(fileHandle);
}

async function writeYamlTextToDirectory(directory: WritableDirectoryHandle, yamlText: string, monthFolder: string) {
  const monthDirectory = await directory.getDirectoryHandle(monthFolder, { create: true });
  const fileHandle = await monthDirectory.getFileHandle(getYamlDownloadFilename(yamlText), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(yamlText);
  await writable.close();
  return warnIfWrittenFileIsEmpty(fileHandle);
}

async function writeTextToDirectory(directory: WritableDirectoryHandle, filename: string, text: string, monthFolder: string) {
  const monthDirectory = await directory.getDirectoryHandle(monthFolder, { create: true });
  const fileHandle = await monthDirectory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
  return warnIfWrittenFileIsEmpty(fileHandle);
}

export default function HandoffMemoTool() {
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
  const [sourceInfo, setSourceInfo] = useState<SourceInfo>(() => ({
    platform: "ChatGPT",
    conversationTitle: "",
    conversationUrl: "",
    savedAt: formatSourceTimestamp(),
    bookmark: "",
  }));
  const conversationTitleFilename = getConversationTitleFilename(sourceInfo);
  const previewYamlText = yamlText ? mergeSourceMetadataIntoYaml(yamlText, sourceInfo) : "";
  const currentYamlFilename = previewYamlText ? getYamlDownloadFilename(previewYamlText) : "";
  const currentSourceLogFilename = conversationTitleFilename
    ? getSourceLogFilenameFromYamlFilename(conversationTitleFilename)
    : sourceLogFilename || getSourceOnlyDownloadFilename();
  const activeFilename =
    activeInputTab === "log-save"
      ? currentSourceLogFilename
      : currentYamlFilename || conversationTitleFilename || memo?.filename || "未生成";

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
    let isMounted = true;

    async function restoreDirectory() {
      if (!("indexedDB" in window)) return;

      try {
        const savedHandle = await loadDirectoryHandle();
        if (!savedHandle || !isMounted) return;

        setDirectoryHandle(savedHandle);
        setDirectoryName(savedHandle.name ?? "選択済みフォルダ");

        const permission = await getDirectoryPermission(savedHandle);
        if (!isMounted) return;
        setStatus(
          permission === "granted"
            ? "保存先フォルダを復元しました。"
            : "保存先フォルダを復元しました。保存時にアクセス許可が必要です。",
        );
      } catch {
        if (isMounted) setStatus("保存先フォルダの復元に失敗しました。");
      }
    }

    restoreDirectory();

    return () => {
      isMounted = false;
    };
  }, []);

  function finishGeneration(nextMemo: HandoffMemo, nextYaml: string, message: string, nextSourceLog = "") {
    setMemo(nextMemo);
    setYamlText(nextYaml);
    setSourceLogText(nextSourceLog);
    setSourceLogFilename(nextSourceLog ? getSourceLogDownloadFilename(nextYaml) : "");
    setActiveOutputTab("yaml");

    if (autoDownload) {
      downloadYaml(getYamlDownloadFilename(nextYaml), nextYaml);
      setStatus(`${message} 自動ダウンロードしました。`);
      return;
    }

    setStatus(`${message} ダウンロードボタンが使えます。`);
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
      setStatus("会話ログを貼り付けてください。");
      return;
    }

    const { nextMemo, nextYaml, nextSourceLog } = buildBulkMemo(source);
    finishGeneration(nextMemo, nextYaml, "知識メモを生成しました。", nextSourceLog);
  }

  async function chooseDirectory() {
    if (!window.showDirectoryPicker) {
      setStatus("このブラウザではフォルダ保存に未対応です。ダウンロード保存を使ってください。");
      return;
    }

    try {
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      setDirectoryName(handle.name ?? "選択済みフォルダ");
      await saveDirectoryHandle(handle);
      setStatus("保存先フォルダを選択し、次回起動用に保存しました。");
    } catch {
      setStatus("フォルダ選択をキャンセルしました。");
    }
  }

  function loadCurrentInput() {
    if (activeInputTab === "memo-save") {
      if (!yamlText.trim()) {
        setStatus("読み込む知識メモを貼り付けてください。");
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
      setStatus("知識メモを更新しました。");
      return;
    }

    if (activeInputTab === "log-save") {
      if (!sourceLogText.trim()) {
        setStatus("読み込む会話ログを貼り付けてください。");
        return;
      }
      setSourceLogFilename((filename) => filename || getSourceOnlyDownloadFilename());
      setActiveOutputTab("source");
      setStatus("会話ログを更新しました。");
      return;
    }

    generate();
  }

  async function saveSourceLogFile() {
    const nextSourceLog = mergeSourceMetadataIntoMarkdown(sourceLogText, sourceInfo).trim();
    if (!sourceLogText.trim() || !nextSourceLog) {
      setStatus(EMPTY_CONTENT_MESSAGE);
      return;
    }

    const filename = currentSourceLogFilename;
    const monthFolder = formatMarkdownTimestamp().slice(0, 7);
    if (directoryHandle) {
      try {
        if (!(await ensureDirectoryPermission(directoryHandle))) {
          setStatus("保存先フォルダへのアクセスが許可されていません。");
          return;
        }
        const isEmptyFile = await writeTextToDirectory(directoryHandle, filename, nextSourceLog, monthFolder);
        if (isEmptyFile) {
          setStatus(ZERO_BYTE_WARNING_MESSAGE);
          return;
        }
        setStatus(`${monthFolder}/${filename} に保存しました。`);
        return;
      } catch {
        setStatus(FOLDER_SAVE_FAILURE_MESSAGE);
        return;
      }
    }

    downloadTextFile(filename, nextSourceLog, "text/markdown;charset=utf-8");
    setStatus("会話ログをダウンロードしました。");
  }

  async function save() {
    if (activeInputTab === "log-save") {
      await saveSourceLogFile();
      return;
    }

    if (!yamlText.trim() && (activeInputTab === "memo-save" || !conversationLog.trim())) {
      setStatus(EMPTY_CONTENT_MESSAGE);
      return;
    }

    let nextMemo = activeInputTab === "memo-save" ? null : memo;
    let nextYaml = mergeSourceMetadataIntoYaml(yamlText, sourceInfo);
    const isPastedYaml = activeInputTab === "memo-save";

    if (!nextYaml.trim()) {
      if (isPastedYaml) {
        setStatus(EMPTY_CONTENT_MESSAGE);
        return;
      }
      if (!conversationLog.trim()) {
        setStatus(EMPTY_CONTENT_MESSAGE);
        return;
      }
      const generated = buildBulkMemo(conversationLog.trim());
      nextMemo = generated.nextMemo;
      nextYaml = generated.nextYaml;
      setSourceLogText(generated.nextSourceLog);
      setSourceLogFilename(generated.nextSourceLog ? getSourceLogDownloadFilename(nextYaml) : "");
      setMemo(nextMemo);
      setYamlText(nextYaml);
    }

    if (directoryHandle) {
      try {
        if (!(await ensureDirectoryPermission(directoryHandle))) {
          setStatus("保存先フォルダへのアクセスが許可されていません。");
          return;
        }
        const monthFolder = nextMemo ? getMemoMonthFolder(nextMemo) : formatMarkdownTimestamp().slice(0, 7);
        let isEmptyFile = false;
        if (nextMemo) {
          isEmptyFile = await writeYamlToDirectory(directoryHandle, nextMemo, nextYaml);
        } else {
          isEmptyFile = await writeYamlTextToDirectory(directoryHandle, nextYaml, monthFolder);
        }
        if (isEmptyFile) {
          setYamlText(nextYaml);
          setStatus(ZERO_BYTE_WARNING_MESSAGE);
          return;
        }
        setYamlText(nextYaml);
        setStatus(`${monthFolder}/${getYamlDownloadFilename(nextYaml)} に保存しました。`);
        return;
      } catch {
        setStatus(FOLDER_SAVE_FAILURE_MESSAGE);
        return;
      }
    }

    setYamlText(nextYaml);
    downloadYaml(getYamlDownloadFilename(nextYaml), nextYaml);
    setStatus("知識メモをダウンロードしました。");
  }

  function download() {
    if (activeInputTab === "log-save") {
      downloadSourceLog();
      return;
    }

    if (!yamlText) {
      setStatus("先に知識メモを生成または貼り付けてください。");
      return;
    }
    const nextYaml = mergeSourceMetadataIntoYaml(yamlText, sourceInfo);
    setYamlText(nextYaml);
    downloadYaml(getYamlDownloadFilename(nextYaml), nextYaml);
    setStatus("知識メモをダウンロードしました。");
  }

  function downloadSourceLog() {
    if (!sourceLogText) {
      setStatus("会話ログがありません。先に会話ログを生成してください。");
      return;
    }
    const nextSourceLog = mergeSourceMetadataIntoMarkdown(sourceLogText, sourceInfo);
    setSourceLogText(nextSourceLog);
    downloadTextFile(currentSourceLogFilename, nextSourceLog, "text/markdown;charset=utf-8");
    setStatus("会話ログをダウンロードしました。");
  }

  function downloadBoth() {
    if (!yamlText) {
      setStatus("先に知識メモを生成または貼り付けてください。");
      return;
    }
    const nextYaml = mergeSourceMetadataIntoYaml(yamlText, sourceInfo);
    setYamlText(nextYaml);
    downloadYaml(getYamlDownloadFilename(nextYaml), nextYaml);
    if (sourceLogText) {
      const nextSourceLog = mergeSourceMetadataIntoMarkdown(sourceLogText, sourceInfo);
      setSourceLogText(nextSourceLog);
      downloadTextFile(
        sourceLogFilename || getSourceLogDownloadFilename(nextYaml),
        nextSourceLog,
        "text/markdown;charset=utf-8",
      );
      setStatus("知識メモと会話ログをダウンロードしました。");
      return;
    }
    setStatus("知識メモをダウンロードしました。会話ログはありません。");
  }

  async function copyShioriPrompt() {
    try {
      await navigator.clipboard.writeText(SHIORI_ARCHIVE_PROMPT);
      setStatus("しおりプロンプトをコピーしました。");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = SHIORI_ARCHIVE_PROMPT;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        setStatus(copied ? "しおりプロンプトをコピーしました。" : "しおりプロンプトのコピーに失敗しました。");
      } catch {
        setStatus("しおりプロンプトのコピーに失敗しました。");
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Reusable conversation archive</p>
            <h1 className="mt-1 text-xl font-bold">AI会話知識アーカイブ</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="space-y-4">
          <div className="rounded-md border border-stone-200 bg-white p-4">
            <div className="grid gap-1 rounded-md border border-stone-300 bg-stone-100 p-1 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ["memo-save", "知識メモ保存（YAML）"],
                ["log-save", "会話ログ保存（Markdown）"],
                ["prompt", "しおりプロンプト"],
                ["memo-create", "知識メモ作成"],
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
                  知識メモ保存（YAML）
                </label>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  ChatGPT、Claude、Geminiなどで生成した知識メモを貼り付けて保存します。conversation_title を入力すると YYYY-MM-DD_会話タイトル.yaml で保存します。
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
                  placeholder="filename: example.yaml"
                  spellCheck={false}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={loadCurrentInput}
                    className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    更新
                  </button>
                </div>
              </div>
            )}

            {activeInputTab === "log-save" && (
              <div className="mt-4">
                <label htmlFor="log-save-input" className="text-sm font-bold">
                  会話ログ保存（Markdown）
                </label>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  ChatGPT、Claude、Geminiなどで生成した会話ログを貼り付けて保存します。Markdown形式のまま .md ファイルとして扱います。
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
                  placeholder="# Source Conversation"
                  spellCheck={false}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={loadCurrentInput}
                    className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    更新
                  </button>
                </div>
              </div>
            )}

            {activeInputTab === "prompt" && (
              <div className="mt-4 rounded-md border border-teal-100 bg-teal-50 p-4">
                <p className="text-sm font-bold text-stone-950">しおりプロンプト</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  ChatGPT / Claude / Gemini のカスタム指示や会話冒頭に貼り付けて、/しおり や /archive 出力を使えるようにします。
                </p>
                <button
                  type="button"
                  onClick={copyShioriPrompt}
                  className="mt-3 h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                >
                  しおりプロンプトをコピー
                </button>
                <p className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-5 text-stone-600">{status || "待機中"}</p>
              </div>
            )}

            {activeInputTab === "memo-create" && (
              <div className="mt-4">
                <label htmlFor="conversation-log" className="text-sm font-bold">
                  知識メモ作成
                </label>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  会話ログ、個人メモ、アイデアメモ、note下書き、設計メモなどを貼り付け、再利用しやすい知識メモに変換します。
                </p>
                <textarea
                  id="conversation-log"
                  value={conversationLog}
                  onChange={(event) => setConversationLog(event.target.value)}
                  className="mt-2 min-h-[430px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  placeholder="知識メモに変換したい内容をここに貼り付け"
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={generate}
                    className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    知識メモを作成
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationLog(sampleLog)}
                    className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                  >
                    サンプル入力
                  </button>
                </div>
              </div>
            )}
          </div>

          {activeInputTab !== "prompt" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-stone-200 bg-white p-4">
                <p className="text-xs font-semibold text-stone-500">filename</p>
                <p className="mt-2 break-words text-sm font-bold">{activeFilename}</p>
              </div>
              <div className="rounded-md border border-stone-200 bg-white p-4">
                <p className="text-xs font-semibold text-stone-500">status</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6">{status || "待機中"}</p>
              </div>
            </div>
          )}

          {activeInputTab !== "prompt" && (
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="text-sm font-bold text-stone-950">保存情報</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                元チャットを後から探しやすくするための情報です。conversation_title はファイル名にも利用されます。
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
                    placeholder="AI会話アーカイブ設計"
                  />
                  <p className="mt-1 text-xs leading-5 text-stone-500">ファイル名にも利用されます。</p>
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
                  <p className="mt-1 text-xs leading-5 text-stone-500">元チャットURL（任意）</p>
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
                  placeholder="どのチャットだったか思い出すためのしおりメモ"
                />
                <p className="mt-1 text-xs leading-5 text-stone-500">後で何を思い出したい会話かを記録します。</p>
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
                保存先フォルダを選択
              </button>
              <div className="min-w-[180px]">
                <button
                  type="button"
                  onClick={save}
                  className="h-11 rounded-md bg-stone-950 px-5 text-sm font-bold text-white hover:bg-stone-800"
                >
                  📁 フォルダに保存
                </button>
                <p className="mt-1 text-xs font-medium text-stone-500">選択したフォルダへ保存します</p>
              </div>
              <div className="min-w-[220px]">
                <button
                  type="button"
                  onClick={download}
                  className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                >
                  ⬇️ ダウンロード
                </button>
                <p className="mt-1 text-xs font-medium text-stone-500">ブラウザのダウンロードフォルダへ保存します</p>
              </div>
              {activeInputTab === "memo-create" && (
                <label className="flex h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={autoDownload}
                    onChange={(event) => setAutoDownload(event.target.checked)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  作成後に自動ダウンロード
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
                  会話ログも保存する
                </label>
              )}
              {sourceLogText && activeInputTab !== "log-save" && (
                <>
                  <button
                    type="button"
                    onClick={downloadSourceLog}
                    className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                  >
                    会話ログをダウンロード
                  </button>
                  <button
                    type="button"
                    onClick={downloadBoth}
                    className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                  >
                    両方ダウンロード
                  </button>
                </>
              )}
            </div>
          )}

          {activeInputTab !== "prompt" && (
            <div className="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700">
              <p className="font-semibold text-stone-950">保存先</p>
              <p className="mt-1 font-bold text-stone-950">
                {directoryHandle ? directoryName || "選択済みフォルダ" : "未選択"}
              </p>
              <p className="mt-1">
                {directoryHandle
                  ? activeInputTab === "log-save"
                    ? "選択済みフォルダ / YYYY-MM / filename.md"
                    : "選択済みフォルダ / YYYY-MM / filename.yaml"
                  : "未選択の場合はブラウザのダウンロードフォルダへ保存"}
              </p>
              <p className="mt-2 text-stone-500">
                フォルダ指定に未対応のブラウザでは、ダウンロード保存を使います。
              </p>
              <p className="mt-2 text-stone-500">
                Google Driveなどの同期フォルダへ保存する場合、フォルダ保存が失敗することがあります。その場合は「ダウンロード」を使い、ブラウザの保存先をGoogle Drive同期フォルダに設定してください。
              </p>
            </div>
          )}

        </section>

        <section className="space-y-4">
          <div>
            <label htmlFor="yaml-output" className="text-sm font-bold">
              出力プレビュー
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
                  {tab === "yaml" ? "知識メモ（YAML）" : "会話ログ（Markdown）"}
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
              placeholder={activeOutputTab === "yaml" ? "生成された知識メモがここに表示されます" : "生成された会話ログがここに表示されます"}
              spellCheck={false}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
