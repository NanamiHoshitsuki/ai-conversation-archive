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
      write(data: Blob): Promise<void>;
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

type PreparedBlobFile = {
  filename: string;
  blob: Blob;
};

type SaveToast = {
  title: string;
  filenames: string[];
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
    saveZip: "ZIP保存（推奨）",
    saveZipHelp: "YAMLとMarkdownを1つのZIPにまとめて保存します",
    saveYaml: "YAML保存",
    saveMarkdown: "Markdown保存",
    download: "YAML保存",
    downloadHelp: "YAML単体を保存します",
    autoDownload: "作成後に自動ダウンロード",
    alsoSaveLog: "会話ログも保存する",
    downloadLog: "Markdown保存",
    downloadBoth: "ZIP保存（推奨）",
    saving: "保存中...",
    savedToastTitle: "✓ 保存しました",
    zipSavedToastTitle: "✓ ZIP保存しました",
    folderSavedToastTitle: "✓ 2ファイルを保存しました",
    savedBothToFolder: (monthFolder: string, yamlFilename: string, sourceFilename: string) =>
      `${monthFolder}/${yamlFilename} と ${monthFolder}/${sourceFilename} に保存しました。`,
    destination: "保存先",
    selectedFolder: "選択済みフォルダ",
    notSelected: "未選択",
    selectedYamlPath: "選択済みフォルダ / YYYY-MM / filename.yaml",
    selectedMarkdownPath: "選択済みフォルダ / YYYY-MM / filename.source.md",
    downloadFallback: "未選択の場合はブラウザのダウンロードフォルダへ保存",
    folderUnsupportedHelp: "フォルダ指定に未対応のブラウザでは、ダウンロード保存を使います。",
    folderDownloadFallback: "フォルダ保存に失敗したため、通常ダウンロードに切り替えました。",
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
    folderMobileHidden: "スマホではフォルダ保存を使わず、ZIP保存を使ってください。",
    folderSaveFailedFile: (filename: string) => `${filename} のフォルダ保存に失敗しました。`,
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
    zipDownloaded: "ZIPを保存しました。",
    memoDownloadedNoLog: "知識メモをダウンロードしました。会話ログはありません。",
    createOrPasteFirst: "先に知識メモを生成または貼り付けてください。",
    noLog: "会話ログがありません。先に会話ログを生成してください。",
    needYamlAndMarkdown: "ZIP保存にはYAMLとMarkdownの両方が必要です。",
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
    saveZip: "Save ZIP (Recommended)",
    saveZipHelp: "Save YAML and Markdown together in one ZIP file",
    saveYaml: "Save YAML",
    saveMarkdown: "Save Markdown",
    download: "Save YAML",
    downloadHelp: "Save only the YAML file",
    autoDownload: "Download automatically after creation",
    alsoSaveLog: "Also save conversation log",
    downloadLog: "Save Markdown",
    downloadBoth: "Save ZIP (Recommended)",
    saving: "Saving...",
    savedToastTitle: "✓ Saved",
    zipSavedToastTitle: "✓ ZIP saved",
    folderSavedToastTitle: "✓ 2 files saved",
    savedBothToFolder: (monthFolder: string, yamlFilename: string, sourceFilename: string) =>
      `Saved to ${monthFolder}/${yamlFilename} and ${monthFolder}/${sourceFilename}.`,
    destination: "Save Destination",
    selectedFolder: "Selected folder",
    notSelected: "Not selected",
    selectedYamlPath: "Selected folder / YYYY-MM / filename.yaml",
    selectedMarkdownPath: "Selected folder / YYYY-MM / filename.source.md",
    downloadFallback: "If no folder is selected, files are saved to the browser download folder",
    folderUnsupportedHelp: "If your browser does not support folder selection, use download instead.",
    folderDownloadFallback: "Folder save failed, so the file was downloaded instead.",
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
    folderMobileHidden: "On mobile, use ZIP saving instead of folder saving.",
    folderSaveFailedFile: (filename: string) => `Folder save failed for ${filename}.`,
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
    zipDownloaded: "ZIP saved.",
    memoDownloadedNoLog: "Knowledge memo downloaded. No conversation log is available.",
    createOrPasteFirst: "Create or paste a knowledge memo first.",
    noLog: "No conversation log available. Generate one first.",
    needYamlAndMarkdown: "ZIP saving requires both YAML and Markdown.",
    sampleLog: `User:
I want to preserve AI conversations as knowledge assets that can be reviewed later.
I want decisions and next actions near the top.
Common fields should be fixed, and use-case specific fields should be extension blocks.
For entrepreneurs, use business_opportunities; for researchers, use research_questions; for creators, use content_ideas.
The goal is not to save the raw conversation, but to preserve reusable outcomes.`,
  },
} as const;

function assertNonEmptyContent(content: string) {
  if (content.trim().length === 0) {
    throw new Error("Cannot save empty archive content.");
  }
}

function downloadBlob(filename: string, blob: Blob) {
  if (blob.size === 0) {
    throw new Error("Cannot save empty archive content.");
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  assertNonEmptyContent(content);
  downloadBlob(filename, new Blob([content], { type: mimeType }));
}

function downloadPreparedFiles(files: PreparedTextFile[]) {
  files.forEach((file) => {
    downloadTextFile(file.filename, file.content, file.mimeType);
  });
}

function buildBaseFilename(yamlContent: string, sourceInfo: SourceInfo, fallbackDate = new Date()) {
  const conversationTitle = sourceInfo.conversationTitle.trim();
  if (conversationTitle) {
    return stripArchiveFilenameExtension(buildConversationTitleFilename(conversationTitle, getFilenameDate(sourceInfo)));
  }
  return stripArchiveFilenameExtension(getYamlDownloadFilename(yamlContent, fallbackDate));
}

function buildYamlFilename(baseFilename: string) {
  return buildArchiveFilename(baseFilename, ".yaml");
}

function buildMarkdownFilename(baseFilename: string) {
  return buildArchiveFilename(baseFilename, ".source.md");
}

function buildZipFilename(baseFilename: string) {
  return buildArchiveFilename(baseFilename, ".zip");
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
    filename: buildYamlFilename(baseFilename),
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
    filename: buildMarkdownFilename(baseFilename),
    content,
    mimeType: "text/markdown;charset=utf-8",
  };
}

function buildZipFile(files: PreparedTextFile[], baseFilename: string): PreparedBlobFile {
  files.forEach((file) => assertNonEmptyContent(file.content));
  return {
    filename: buildZipFilename(baseFilename),
    blob: createZipBlob(files),
  };
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function getZipDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, time };
}

function zipPart(bytes: Uint8Array) {
  const buffer = bytes.buffer as ArrayBuffer;
  return buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function createZipBlob(files: PreparedTextFile[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;
  const { dosDate, time } = getZipDateTime();

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.filename);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);
    const localHeader: number[] = [];

    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0x0800);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, time);
    writeUint16(localHeader, dosDate);
    writeUint32(localHeader, checksum);
    writeUint32(localHeader, contentBytes.length);
    writeUint32(localHeader, contentBytes.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);

    const localChunk = new Uint8Array(localHeader.length + nameBytes.length + contentBytes.length);
    localChunk.set(localHeader, 0);
    localChunk.set(nameBytes, localHeader.length);
    localChunk.set(contentBytes, localHeader.length + nameBytes.length);
    chunks.push(localChunk);

    const centralHeader: number[] = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0x0800);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, time);
    writeUint16(centralHeader, dosDate);
    writeUint32(centralHeader, checksum);
    writeUint32(centralHeader, contentBytes.length);
    writeUint32(centralHeader, contentBytes.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);

    const centralChunk = new Uint8Array(centralHeader.length + nameBytes.length);
    centralChunk.set(centralHeader, 0);
    centralChunk.set(nameBytes, centralHeader.length);
    centralDirectory.push(centralChunk);

    offset += localChunk.length;
  });

  const centralDirectorySize = centralDirectory.reduce((total, chunk) => total + chunk.length, 0);
  const endHeader: number[] = [];
  writeUint32(endHeader, 0x06054b50);
  writeUint16(endHeader, 0);
  writeUint16(endHeader, 0);
  writeUint16(endHeader, files.length);
  writeUint16(endHeader, files.length);
  writeUint32(endHeader, centralDirectorySize);
  writeUint32(endHeader, offset);
  writeUint16(endHeader, 0);

  return new Blob([...chunks, ...centralDirectory, new Uint8Array(endHeader)].map(zipPart), { type: "application/zip" });
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
  if (source.platform) {
    lines.push(`platform: ${source.platform}`);
    if (source.platform.toLowerCase() === "chatgpt") {
      lines.push("platform_url: https://chatgpt.com/");
    }
  }
  if (source.conversation_title) lines.push(`conversation_title: ${source.conversation_title}`);
  if (source.conversation_url) lines.push(`conversation_url: ${source.conversation_url}`);
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

function getSourceMarkdownBody(markdownText: string) {
  const normalized = markdownText.trimStart();
  if (!normalized.startsWith("# Source Conversation")) {
    return normalized.trimEnd();
  }

  const [, ...rest] = normalized.split("\n");
  let index = 0;
  let consumedMetadata = false;

  while (index < rest.length && !rest[index].trim()) index += 1;

  while (index < rest.length) {
    const line = rest[index].trim();
    if (line === "---") {
      index += 1;
      consumedMetadata = true;
      break;
    }
    if (/^(saved_at|platform|platform_url|conversation_title|conversation_url):/.test(line)) {
      index += 1;
      consumedMetadata = true;
      continue;
    }
    if (line === "bookmark:") {
      index += 1;
      consumedMetadata = true;
      while (index < rest.length && rest[index].trim() && rest[index].trim() !== "---") index += 1;
      continue;
    }
    if (!line && consumedMetadata) {
      index += 1;
      continue;
    }
    break;
  }

  while (index < rest.length && !rest[index].trim()) index += 1;
  const body = (consumedMetadata ? rest.slice(index).join("\n") : rest.join("\n")).trimEnd();
  const bodyLines = body.split("\n");
  if (/^\[001]\s+user\s*$/i.test(bodyLines[0]?.trim() ?? "") && !bodyLines.some((line) => /^\[002]\s+/i.test(line.trim()))) {
    return bodyLines.slice(1).join("\n").trimStart().trimEnd();
  }
  return body;
}

function mergeSourceMetadataIntoMarkdown(markdownText: string, sourceInfo: SourceInfo) {
  const body = getSourceMarkdownBody(markdownText);
  assertNonEmptyContent(body);
  return ["# Source Conversation", "", ...sourceMetadataLines(sourceInfo), "", "---", "", body].join("\n").trimEnd() + "\n";
}

function getSourceOnlyDownloadFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}_source-conversation.source.md`;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
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
  mimeType: string,
) {
  assertNonEmptyContent(content);
  const monthDirectory = await directory.getDirectoryHandle(monthFolder, { create: true });
  const fileHandle = await monthDirectory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([content], { type: mimeType }));
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
  const [supportsDirectoryPicker] = useState(() => {
    if (typeof window === "undefined") return false;
    return typeof window.showDirectoryPicker === "function";
  });
  const [isMobile] = useState(() => isMobileBrowser());
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<SaveToast | null>(null);
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
  const canSaveZip = Boolean(conversationLog.trim() || (yamlText.trim() && sourceLogText.trim()));
  const canUseFolderSave = supportsDirectoryPicker && !isMobile;
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

  function showSaveToast(files: PreparedTextFile[]) {
    setSaveToast({
      title: t.savedToastTitle,
      filenames: files.map((file) => file.filename),
    });
  }

  function showBlobSaveToast(file: PreparedBlobFile, title: string = t.savedToastTitle) {
    setSaveToast({
      title,
      filenames: [file.filename],
    });
  }

  function getArchiveBaseFilename(yamlContent: string) {
    return buildBaseFilename(yamlContent, sourceInfo);
  }

  function prepareYamlFile(sourceYamlText = yamlText) {
    return buildYamlFile(sourceYamlText, sourceInfo);
  }

  function prepareMarkdownFile(yamlContent = "", sourceMarkdownText = sourceLogText) {
    return buildMarkdownFile(sourceMarkdownText, sourceInfo, yamlContent);
  }

  function prepareArchivePair(sourceYamlText = yamlText, sourceMarkdownText = sourceLogText) {
    const yamlFile = prepareYamlFile(sourceYamlText);
    const markdownFile = prepareMarkdownFile(yamlFile.content, sourceMarkdownText);
    return {
      yamlFile,
      markdownFile,
      baseFilename: getArchiveBaseFilename(yamlFile.content),
    };
  }

  async function beginSaveAction() {
    setIsSaving(true);
    setSaveToast(null);
    setStatus(t.saving);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function finishSaveAction() {
    setIsSaving(false);
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
    if (!saveToast) return;
    const timeout = window.setTimeout(() => setSaveToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [saveToast]);

  useEffect(() => {
    let isMounted = true;

    async function restoreDirectory() {
      if (!canUseFolderSave) return;
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
  }, [canUseFolderSave, t.folderRestoreFailed, t.folderRestored, t.folderRestoredNeedsPermission, t.selectedFolder]);

  function finishGeneration(nextMemo: HandoffMemo, nextYaml: string, message: string, nextSourceLog = "") {
    setMemo(nextMemo);
    setYamlText(nextYaml);
    setSourceLogText(nextSourceLog);
    setSourceLogFilename(nextSourceLog ? getSourceLogDownloadFilename(nextYaml) : "");
    setActiveOutputTab("yaml");

    if (autoDownload) {
      try {
        const yamlFile = buildYamlFile(nextYaml, sourceInfo);
        if (nextSourceLog.trim()) {
          const markdownFile = buildMarkdownFile(nextSourceLog, sourceInfo, yamlFile.content);
          const zipFile = buildZipFile([yamlFile, markdownFile], buildBaseFilename(yamlFile.content, sourceInfo));
          downloadBlob(zipFile.filename, zipFile.blob);
          showBlobSaveToast(zipFile, t.zipSavedToastTitle);
        } else {
          downloadTextFile(yamlFile.filename, yamlFile.content, yamlFile.mimeType);
          showSaveToast([yamlFile]);
        }
        setStatus(`${message} ${t.autoDownloaded}`);
      } catch {
        setStatus(t.emptyContent);
      }
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
      "---",
      "",
    ];

    const body = params.messages.map((message) => message.text).join("\n\n").trimEnd();
    if (body) lines.push(body, "");

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
    if (!canUseFolderSave || !window.showDirectoryPicker) {
      setStatus(isMobile ? t.folderMobileHidden : t.folderUnsupported);
      return;
    }

    try {
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      setDirectoryName(handle.name ?? t.selectedFolder);
      await saveDirectoryHandle(handle);
      setStatus(t.folderChosen);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus(t.folderCanceled);
        return;
      }
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

  function generateArchiveFromConversation() {
    if (!conversationLog.trim()) return null;
    const generated = buildBulkMemo(conversationLog.trim());
    setMemo(generated.nextMemo);
    setYamlText(generated.nextYaml);
    setSourceLogText(generated.nextSourceLog);
    setSourceLogFilename(generated.nextSourceLog ? getSourceLogDownloadFilename(generated.nextYaml) : "");
    return generated;
  }

  async function saveMarkdown() {
    if (isSaving) return;
    if (!sourceLogText.trim()) {
      setStatus(t.emptyContent);
      return;
    }

    await beginSaveAction();
    try {
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
            downloadPreparedFiles([markdownFile]);
            setSourceLogText(markdownFile.content);
            setSourceLogFilename(markdownFile.filename);
            setStatus(`${t.folderPermissionDenied}\n\n${t.folderDownloadFallback}`);
            return;
          }
          const isEmptyFile = await saveTextFileToDirectory(
            directoryHandle,
            markdownFile.filename,
            markdownFile.content,
            monthFolder,
            markdownFile.mimeType,
          );
          if (isEmptyFile) {
            downloadPreparedFiles([markdownFile]);
            setSourceLogText(markdownFile.content);
            setSourceLogFilename(markdownFile.filename);
            setStatus(`${t.zeroByteWarning}\n\n${t.folderDownloadFallback}`);
            return;
          }
          setSourceLogText(markdownFile.content);
          setSourceLogFilename(markdownFile.filename);
          setStatus(t.savedTo(`${monthFolder}/${markdownFile.filename}`));
          showSaveToast([markdownFile]);
          return;
        } catch {
          try {
            downloadPreparedFiles([markdownFile]);
            setSourceLogText(markdownFile.content);
            setSourceLogFilename(markdownFile.filename);
            setStatus(`${t.folderSaveFailure}\n\n${t.folderDownloadFallback}`);
          } catch {
            setStatus(t.folderSaveFailure);
          }
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
      showSaveToast([markdownFile]);
    } finally {
      finishSaveAction();
    }
  }

  async function saveYaml() {
    if (isSaving) return;
    if (!yamlText.trim() && !conversationLog.trim()) {
      setStatus(t.createOrPasteFirst);
      return;
    }

    await beginSaveAction();
    try {
      const sourceYamlText = yamlText.trim() ? yamlText : generateArchiveFromConversation()?.nextYaml;
      if (!sourceYamlText) {
        setStatus(t.emptyContent);
        return;
      }
      let yamlFile: PreparedTextFile;
      try {
        yamlFile = prepareYamlFile(sourceYamlText);
        downloadTextFile(yamlFile.filename, yamlFile.content, yamlFile.mimeType);
      } catch {
        setStatus(t.emptyContent);
        return;
      }
      setYamlText(yamlFile.content);
      setStatus(t.memoDownloaded);
      showSaveToast([yamlFile]);
    } finally {
      finishSaveAction();
    }
  }

  async function saveZip() {
    if (isSaving) return;
    if (!yamlText.trim() && !conversationLog.trim()) {
      setStatus(t.createOrPasteFirst);
      return;
    }

    await beginSaveAction();
    try {
      const generated = !yamlText.trim() ? generateArchiveFromConversation() : null;
      const sourceYamlText = yamlText.trim() ? yamlText : generated?.nextYaml;
      const sourceMarkdownText = sourceLogText.trim() ? sourceLogText : generated?.nextSourceLog;
      if (!sourceYamlText || !sourceMarkdownText) {
        setStatus(t.needYamlAndMarkdown);
        return;
      }

      let yamlFile: PreparedTextFile;
      let markdownFile: PreparedTextFile;
      let zipFile: PreparedBlobFile;
      try {
        const prepared = prepareArchivePair(sourceYamlText, sourceMarkdownText);
        yamlFile = prepared.yamlFile;
        markdownFile = prepared.markdownFile;
        zipFile = buildZipFile([yamlFile, markdownFile], prepared.baseFilename);
        downloadBlob(zipFile.filename, zipFile.blob);
      } catch {
        setStatus(t.emptyContent);
        return;
      }

      setYamlText(yamlFile.content);
      setSourceLogText(markdownFile.content);
      setSourceLogFilename(markdownFile.filename);
      setStatus(t.zipDownloaded);
      showBlobSaveToast(zipFile, t.zipSavedToastTitle);
    } finally {
      finishSaveAction();
    }
  }

  async function saveToDirectory() {
    if (isSaving) return;
    if (!canUseFolderSave || !directoryHandle) {
      setStatus(t.folderUnsupported);
      return;
    }
    if (!yamlText.trim() && !conversationLog.trim()) {
      setStatus(t.createOrPasteFirst);
      return;
    }

    await beginSaveAction();
    try {
      const generated = !yamlText.trim() ? generateArchiveFromConversation() : null;
      const sourceYamlText = yamlText.trim() ? yamlText : generated?.nextYaml;
      const sourceMarkdownText = sourceLogText.trim() ? sourceLogText : generated?.nextSourceLog;
      if (!sourceYamlText || !sourceMarkdownText) {
        setStatus(t.needYamlAndMarkdown);
        return;
      }

      let yamlFile: PreparedTextFile;
      let markdownFile: PreparedTextFile;
      try {
        const prepared = prepareArchivePair(sourceYamlText, sourceMarkdownText);
        yamlFile = prepared.yamlFile;
        markdownFile = prepared.markdownFile;
      } catch {
        setStatus(t.emptyContent);
        return;
      }

      if (!(await ensureDirectoryPermission(directoryHandle))) {
        setStatus(t.folderPermissionDenied);
        return;
      }
      const monthFolder = formatMarkdownTimestamp().slice(0, 7);
      let yamlEmpty = false;
      try {
        yamlEmpty = await saveTextFileToDirectory(directoryHandle, yamlFile.filename, yamlFile.content, monthFolder, yamlFile.mimeType);
      } catch {
        setStatus(t.folderSaveFailedFile(yamlFile.filename));
        return;
      }
      try {
        if (yamlEmpty) {
          setStatus(`${t.folderSaveFailedFile(yamlFile.filename)}\n\n${t.zeroByteWarning}`);
          return;
        }
        const markdownEmpty = await saveTextFileToDirectory(
          directoryHandle,
          markdownFile.filename,
          markdownFile.content,
          monthFolder,
          markdownFile.mimeType,
        );
        if (markdownEmpty) {
          setStatus(`${t.folderSaveFailedFile(markdownFile.filename)}\n\n${t.zeroByteWarning}`);
          return;
        }
      } catch {
        setStatus(t.folderSaveFailedFile(markdownFile.filename));
        return;
      }

      setYamlText(yamlFile.content);
      setSourceLogText(markdownFile.content);
      setSourceLogFilename(markdownFile.filename);
      setStatus(t.savedBothToFolder(formatMarkdownTimestamp().slice(0, 7), yamlFile.filename, markdownFile.filename));
      setSaveToast({
        title: t.folderSavedToastTitle,
        filenames: [yamlFile.filename, markdownFile.filename],
      });
    } finally {
      finishSaveAction();
    }
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
      {saveToast && (
        <div className="fixed right-4 top-4 z-50 max-w-[calc(100vw-2rem)] rounded-md border border-teal-200 bg-white px-4 py-3 text-sm shadow-lg sm:max-w-md">
          <p className="font-bold text-teal-700">{saveToast.title}</p>
          <ul className="mt-2 space-y-1 text-stone-700">
            {saveToast.filenames.map((filename) => (
              <li key={filename} className="break-words">
                - {filename}
              </li>
            ))}
          </ul>
        </div>
      )}
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
              <div className="min-w-[220px]">
                <button
                  type="button"
                  onClick={saveZip}
                  disabled={!canSaveZip || isSaving}
                  className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {isSaving ? t.saving : t.saveZip}
                </button>
                <p className="mt-1 text-xs font-medium text-stone-500">{t.saveZipHelp}</p>
              </div>
              <div className="min-w-[160px]">
                <button
                  type="button"
                  onClick={saveYaml}
                  disabled={isSaving}
                  className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                >
                  {isSaving ? t.saving : t.saveYaml}
                </button>
                <p className="mt-1 text-xs font-medium text-stone-500">{t.downloadHelp}</p>
              </div>
              <div className="min-w-[180px]">
                <button
                  type="button"
                  onClick={saveMarkdown}
                  disabled={!canDownloadSourceLog || isSaving}
                  className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                >
                  {isSaving ? t.saving : t.saveMarkdown}
                </button>
                <p className="mt-1 text-xs font-medium text-stone-500">{t.sourceOutputTab}</p>
              </div>
              {canUseFolderSave ? (
                <>
                  <button
                    type="button"
                    onClick={chooseDirectory}
                    disabled={isSaving}
                    className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                  >
                    {t.chooseFolder}
                  </button>
                  <div className="min-w-[180px]">
                    <button
                      type="button"
                      onClick={saveToDirectory}
                      disabled={!directoryHandle || isSaving}
                      className="h-11 rounded-md bg-stone-950 px-5 text-sm font-bold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                    >
                      {isSaving ? t.saving : t.saveToFolder}
                    </button>
                    <p className="mt-1 text-xs font-medium text-stone-500">{t.saveToFolderHelp}</p>
                  </div>
                </>
              ) : !isMobile ? (
                <p className="min-h-11 rounded-md border border-stone-300 bg-stone-50 px-4 py-3 text-sm font-bold text-stone-600">
                  {t.folderUnsupported}
                </p>
              ) : null}
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
            </div>
          )}

          {activeInputTab !== "prompt" && (
            <div className="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700">
              <p className="font-semibold text-stone-950">{t.destination}</p>
              <p className="mt-1 font-bold text-stone-950">
                {!canUseFolderSave
                  ? isMobile
                    ? t.folderMobileHidden
                    : t.folderUnsupported
                  : directoryHandle
                    ? directoryName || t.selectedFolder
                    : t.notSelected}
              </p>
              <p className="mt-1">
                {!canUseFolderSave
                  ? t.downloadFallback
                  : directoryHandle
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
