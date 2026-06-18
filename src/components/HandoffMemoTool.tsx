"use client";

import { useState } from "react";
import {
  generateHandoffMemo,
  getMemoMonthFolder,
  getSourceLogDownloadFilename,
  getSourceLogFilenameFromYamlFilename,
  getYamlDownloadFilename,
  memoToYaml,
  type HandoffMemo,
} from "@/lib/handoffMemo";

type WritableDirectoryHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<WritableDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
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
type InputTab = "memo-save" | "log-save" | "memo-create";

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

function formatMarkdownTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function getSourceOnlyDownloadFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}_source-conversation.md`;
}

async function writeYamlToDirectory(directory: WritableDirectoryHandle, memo: HandoffMemo, yamlText: string) {
  const monthDirectory = await directory.getDirectoryHandle(getMemoMonthFolder(memo), { create: true });
  const fileHandle = await monthDirectory.getFileHandle(getYamlDownloadFilename(yamlText), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(yamlText);
  await writable.close();
}

async function writeYamlTextToDirectory(directory: WritableDirectoryHandle, yamlText: string, monthFolder: string) {
  const monthDirectory = await directory.getDirectoryHandle(monthFolder, { create: true });
  const fileHandle = await monthDirectory.getFileHandle(getYamlDownloadFilename(yamlText), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(yamlText);
  await writable.close();
}

async function writeTextToDirectory(directory: WritableDirectoryHandle, filename: string, text: string, monthFolder: string) {
  const monthDirectory = await directory.getDirectoryHandle(monthFolder, { create: true });
  const fileHandle = await monthDirectory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

export default function HandoffMemoTool() {
  const [activeInputTab, setActiveInputTab] = useState<InputTab>("memo-save");
  const [conversationLog, setConversationLog] = useState("");
  const [memo, setMemo] = useState<HandoffMemo | null>(null);
  const [yamlText, setYamlText] = useState("");
  const [directoryHandle, setDirectoryHandle] = useState<WritableDirectoryHandle | null>(null);
  const [status, setStatus] = useState("");
  const [autoDownload, setAutoDownload] = useState(false);
  const [saveSourceLog, setSaveSourceLog] = useState(true);
  const [sourceLogText, setSourceLogText] = useState("");
  const [sourceLogFilename, setSourceLogFilename] = useState("");
  const [activeOutputTab, setActiveOutputTab] = useState<OutputTab>("yaml");
  const currentYamlFilename = yamlText ? getYamlDownloadFilename(yamlText) : "";
  const currentSourceLogFilename = sourceLogFilename || getSourceOnlyDownloadFilename();
  const activeFilename =
    activeInputTab === "log-save" ? currentSourceLogFilename : memo?.filename ?? (currentYamlFilename || "未生成");
  const activeType = activeInputTab === "log-save" ? "Markdown" : memo?.type ?? "YAML";

  function selectInputTab(tab: InputTab) {
    setActiveInputTab(tab);
    setActiveOutputTab(tab === "log-save" ? "source" : "yaml");
  }

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
    savedAt: string;
    messages: ChatMessage[];
  }) {
    const lines = [
      "# Source Conversation",
      "",
      `saved_at: ${params.savedAt}`,
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
    const draftMemo = generateHandoffMemo(source, createdAt, {
      source: {
        source_mode: "bulk-convert",
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
        captured_range: {
          before_messages: source.split(/\n+/).filter(Boolean).length,
          after_messages: 0,
        },
      },
    });
    const nextYaml = memoToYaml(nextMemo);
    const nextSourceLog = saveSourceLog
      ? buildSourceLogMarkdown({
          savedAt: formatMarkdownTimestamp(createdAt),
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
      setStatus("保存先フォルダを選択しました。");
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
      setMemo(null);
      setActiveOutputTab("yaml");
      setStatus("知識メモを読み込みました。");
      return;
    }

    if (activeInputTab === "log-save") {
      if (!sourceLogText.trim()) {
        setStatus("読み込む会話ログを貼り付けてください。");
        return;
      }
      setSourceLogFilename((filename) => filename || getSourceOnlyDownloadFilename());
      setActiveOutputTab("source");
      setStatus("会話ログを読み込みました。");
      return;
    }

    generate();
  }

  async function saveSourceLogFile() {
    const nextSourceLog = sourceLogText.trim();
    if (!nextSourceLog) {
      setStatus("保存する会話ログを貼り付けてください。");
      return;
    }

    const filename = currentSourceLogFilename;
    const monthFolder = formatMarkdownTimestamp().slice(0, 7);
    if (directoryHandle) {
      try {
        await writeTextToDirectory(directoryHandle, filename, nextSourceLog, monthFolder);
        setStatus(`${monthFolder}/${filename} に保存しました。`);
        return;
      } catch {
        setStatus("フォルダ保存に失敗しました。ダウンロード保存に切り替えます。");
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

    let nextMemo = activeInputTab === "memo-save" ? null : memo;
    let nextYaml = yamlText;
    const isPastedYaml = activeInputTab === "memo-save";

    if (!nextYaml) {
      if (isPastedYaml) {
        setStatus("保存する知識メモを貼り付けてください。");
        return;
      }
      if (!conversationLog.trim()) {
        setStatus("会話ログを貼り付けてください。");
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
        const monthFolder = nextMemo ? getMemoMonthFolder(nextMemo) : formatMarkdownTimestamp().slice(0, 7);
        if (nextMemo) {
          await writeYamlToDirectory(directoryHandle, nextMemo, nextYaml);
        } else {
          await writeYamlTextToDirectory(directoryHandle, nextYaml, monthFolder);
        }
        setStatus(`${monthFolder}/${getYamlDownloadFilename(nextYaml)} に保存しました。`);
        return;
      } catch {
        setStatus("フォルダ保存に失敗しました。ダウンロード保存に切り替えます。");
      }
    }

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
    downloadYaml(getYamlDownloadFilename(yamlText), yamlText);
    setStatus("知識メモをダウンロードしました。");
  }

  function downloadSourceLog() {
    if (!sourceLogText) {
      setStatus("会話ログがありません。先に会話ログを生成してください。");
      return;
    }
    downloadTextFile(currentSourceLogFilename, sourceLogText, "text/markdown;charset=utf-8");
    setStatus("会話ログをダウンロードしました。");
  }

  function downloadBoth() {
    if (!yamlText) {
      setStatus("先に知識メモを生成または貼り付けてください。");
      return;
    }
    downloadYaml(getYamlDownloadFilename(yamlText), yamlText);
    if (sourceLogText) {
      downloadTextFile(
        sourceLogFilename || getSourceLogDownloadFilename(yamlText),
        sourceLogText,
        "text/markdown;charset=utf-8",
      );
      setStatus("知識メモと会話ログをダウンロードしました。");
      return;
    }
    setStatus("知識メモをダウンロードしました。会話ログはありません。");
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
            <div className="flex rounded-md border border-stone-300 bg-stone-100 p-1">
              {([
                ["memo-save", "知識メモ保存（YAML）"],
                ["log-save", "会話ログ保存（Markdown）"],
                ["memo-create", "知識メモ作成"],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => selectInputTab(tab)}
                  className={`h-9 flex-1 rounded px-3 text-sm font-bold ${
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
                  ChatGPT、Claude、Geminiなどで生成した知識メモを貼り付けて保存します。filename が含まれる場合はその名前で保存します。
                </p>
                <textarea
                  id="memo-save-input"
                  value={yamlText}
                  onChange={(event) => {
                    setYamlText(event.target.value);
                    setMemo(null);
                    setActiveOutputTab("yaml");
                  }}
                  className="mt-2 min-h-[520px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  placeholder="filename: example.yaml"
                  spellCheck={false}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={loadCurrentInput}
                    className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    読み込み
                  </button>
                </div>
                <p className="mt-2 break-words text-xs font-semibold text-stone-500">
                  保存ファイル名: {currentYamlFilename || "YYYY-MM-DD_ai-handoff-memo.yaml"}
                </p>
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
                  className="mt-2 min-h-[520px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  placeholder="# Source Conversation"
                  spellCheck={false}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={loadCurrentInput}
                    className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
                  >
                    読み込み
                  </button>
                </div>
                <p className="mt-2 break-words text-xs font-semibold text-stone-500">
                  保存ファイル名: {currentSourceLogFilename}
                </p>
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
                  className="mt-2 min-h-[520px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
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

          <div className="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700">
            <p className="font-semibold text-stone-950">保存先</p>
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
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold text-stone-500">filename</p>
              <p className="mt-2 break-words text-sm font-bold">{activeFilename}</p>
            </div>
            <div className="rounded-md border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold text-stone-500">format / type</p>
              <p className="mt-2 text-sm font-bold">{activeType}</p>
            </div>
            <div className="rounded-md border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold text-stone-500">status</p>
              <p className="mt-2 text-sm font-bold">{status || "待機中"}</p>
            </div>
          </div>

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
