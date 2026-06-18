"use client";

import { useState } from "react";
import {
  generateHandoffMemo,
  getMemoMonthFolder,
  getSourceLogDownloadFilename,
  getSourceLogFilenameFromYamlFilename,
  getYamlDownloadFilename,
  memoToYaml,
  parseArchiveCommand,
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

async function writeYamlToDirectory(directory: WritableDirectoryHandle, memo: HandoffMemo, yamlText: string) {
  const monthDirectory = await directory.getDirectoryHandle(getMemoMonthFolder(memo), { create: true });
  const fileHandle = await monthDirectory.getFileHandle(getYamlDownloadFilename(yamlText), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(yamlText);
  await writable.close();
}

export default function HandoffMemoTool() {
  const [conversationLog, setConversationLog] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatRole, setChatRole] = useState<ChatMessage["role"]>("user");
  const [memo, setMemo] = useState<HandoffMemo | null>(null);
  const [yamlText, setYamlText] = useState("");
  const [directoryHandle, setDirectoryHandle] = useState<WritableDirectoryHandle | null>(null);
  const [status, setStatus] = useState("");
  const [autoDownload, setAutoDownload] = useState(false);
  const [saveSourceLog, setSaveSourceLog] = useState(true);
  const [sourceLogText, setSourceLogText] = useState("");

  function finishGeneration(nextMemo: HandoffMemo, nextYaml: string, message: string, nextSourceLog = "") {
    setMemo(nextMemo);
    setYamlText(nextYaml);
    setSourceLogText(nextSourceLog);

    if (autoDownload) {
      downloadYaml(getYamlDownloadFilename(nextYaml), nextYaml);
      setStatus(`${message} 自動ダウンロードしました。`);
      return;
    }

    setStatus(`${message} ダウンロードボタンが使えます。`);
  }

  function buildSourceLogMarkdown(params: {
    sourceMode: "bulk-convert" | "chat-save";
    generatedAt: string;
    relatedYaml: string;
    messages: ChatMessage[];
  }) {
    const lines = [
      "# Source Conversation Log",
      "",
      `source_mode: ${params.sourceMode}`,
      `generated_at: ${params.generatedAt}`,
      `related_yaml: ${params.relatedYaml}`,
      "",
      "---",
      "",
      "## Messages",
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
          sourceMode: "bulk-convert",
          generatedAt: nextMemo.source?.saved_at ?? createdAt.toISOString(),
          relatedYaml: nextMemo.filename,
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
    finishGeneration(nextMemo, nextYaml, "YAMLを生成しました。", nextSourceLog);
  }

  function buildChatTranscript(messages: ChatMessage[]) {
    return messages.map((message) => `${message.role === "user" ? "ユーザー" : "AI"}: ${message.text}`).join("\n");
  }

  function getArchiveAnchorText(messages: ChatMessage[]) {
    const userMessage = [...messages].reverse().find((message) => message.role === "user");
    const fallbackMessage = messages.at(-1);
    return (userMessage?.text ?? fallbackMessage?.text ?? "").slice(0, 160);
  }

  function archiveChatHistory(messages: ChatMessage[], triggerCommand: "/archive" | "/保存") {
    const transcript = buildChatTranscript(messages);
    if (messages.length < 2 || transcript.length < 60) {
      setStatus("保存できる内容が不足しています。");
      return;
    }

    const createdAt = new Date();
    const draftMemo = generateHandoffMemo(transcript, createdAt, {
      source: {
        source_mode: "chat-save",
        trigger_command: triggerCommand,
        anchor_text: getArchiveAnchorText(messages),
        message_index: messages.length,
        captured_range: {
          before_messages: messages.length,
          after_messages: 0,
        },
      },
    });
    const sourceLogFile = saveSourceLog ? getSourceLogFilenameFromYamlFilename(draftMemo.filename) : null;
    const nextMemo = generateHandoffMemo(transcript, createdAt, {
      source: {
        source_mode: "chat-save",
        source_log_file: sourceLogFile,
        trigger_command: triggerCommand,
        anchor_text: getArchiveAnchorText(messages),
        message_index: messages.length,
        captured_range: {
          before_messages: messages.length,
          after_messages: 0,
        },
      },
    });
    const nextYaml = memoToYaml(nextMemo);
    const nextSourceLog = saveSourceLog
      ? buildSourceLogMarkdown({
          sourceMode: "chat-save",
          generatedAt: nextMemo.source?.saved_at ?? createdAt.toISOString(),
          relatedYaml: nextMemo.filename,
          messages,
        })
      : "";
    finishGeneration(nextMemo, nextYaml, "チャット履歴からYAMLを生成しました。", nextSourceLog);
  }

  function sendChatMessage() {
    const text = chatInput.trim();
    if (!text) return;

    const command = parseArchiveCommand(text);
    if (command) {
      archiveChatHistory(chatMessages, command.trigger);
      setChatMessages((messages) => [
        ...messages,
        {
          id: Date.now(),
          role: "user",
          text,
        },
      ]);
      setChatInput("");
      return;
    }

    setChatMessages((messages) => [
      ...messages,
      {
        id: Date.now(),
        role: chatRole,
        text,
      },
    ]);
    setChatInput("");
    setStatus("チャットに追加しました。");
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

  async function save() {
    let nextMemo = memo;
    let nextYaml = yamlText;

    if (!nextMemo || !nextYaml) {
      if (!conversationLog.trim()) {
        setStatus("会話ログを貼り付けてください。");
        return;
      }
      const generated = buildBulkMemo(conversationLog.trim());
      nextMemo = generated.nextMemo;
      nextYaml = generated.nextYaml;
      setSourceLogText(generated.nextSourceLog);
      setMemo(nextMemo);
      setYamlText(nextYaml);
    }

    if (directoryHandle) {
      try {
        await writeYamlToDirectory(directoryHandle, nextMemo, nextYaml);
        setStatus(`${getMemoMonthFolder(nextMemo)}/${getYamlDownloadFilename(nextYaml)} に保存しました。`);
        return;
      } catch {
        setStatus("フォルダ保存に失敗しました。ダウンロード保存に切り替えます。");
      }
    }

    downloadYaml(getYamlDownloadFilename(nextYaml), nextYaml);
    setStatus("YAMLをダウンロードしました。");
  }

  function download() {
    if (!yamlText) {
      setStatus("先にYAMLを生成してください。");
      return;
    }
    downloadYaml(getYamlDownloadFilename(yamlText), yamlText);
    setStatus("YAMLをダウンロードしました。");
  }

  function downloadSourceLog() {
    if (!sourceLogText || !yamlText) {
      setStatus("元ログがありません。先にYAMLを生成してください。");
      return;
    }
    downloadTextFile(getSourceLogDownloadFilename(yamlText), sourceLogText, "text/markdown;charset=utf-8");
    setStatus("元ログをダウンロードしました。");
  }

  function downloadBoth() {
    if (!yamlText) {
      setStatus("先にYAMLを生成してください。");
      return;
    }
    downloadYaml(getYamlDownloadFilename(yamlText), yamlText);
    if (sourceLogText) {
      downloadTextFile(getSourceLogDownloadFilename(yamlText), sourceLogText, "text/markdown;charset=utf-8");
      setStatus("YAMLと元ログをダウンロードしました。");
      return;
    }
    setStatus("YAMLをダウンロードしました。元ログはありません。");
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
            <label htmlFor="conversation-log" className="text-sm font-bold">
              一括変換モード
            </label>
            <textarea
              id="conversation-log"
              value={conversationLog}
              onChange={(event) => setConversationLog(event.target.value)}
              className="mt-2 min-h-[520px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              placeholder="ChatGPTなどの会話ログをここに貼り付け"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={generate}
                className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
              >
                YAML生成
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

          <div className="rounded-md border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="chat-input" className="text-sm font-bold">
                チャット保存モード
              </label>
              <div className="flex rounded-md border border-stone-300 bg-stone-50 p-1">
                {(["user", "assistant"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setChatRole(role)}
                    className={`h-8 rounded px-3 text-xs font-bold ${
                      chatRole === role ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-white"
                    }`}
                  >
                    {role === "user" ? "ユーザー" : "AI"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 min-h-[220px] max-h-[360px] overflow-y-auto rounded-md border border-stone-200 bg-stone-50 p-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-stone-500">チャット履歴はまだありません。</p>
              ) : (
                <div className="space-y-2">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-md border p-3 text-sm ${
                        message.role === "user"
                          ? "border-teal-100 bg-white"
                          : "border-stone-200 bg-[#fffaf0]"
                      }`}
                    >
                      <p className="mb-1 text-xs font-bold text-stone-500">
                        {message.role === "user" ? "ユーザー" : "AI"}
                      </p>
                      <p className="whitespace-pre-wrap leading-6">{message.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                id="chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendChatMessage();
                  }
                }}
                className="h-11 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                placeholder="/archive または /保存 で直前履歴からYAML生成"
              />
              <button
                type="button"
                onClick={sendChatMessage}
                className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
              >
                送信
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={chooseDirectory}
              className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
            >
              保存先フォルダ
            </button>
            <button
              type="button"
              onClick={save}
              className="h-11 rounded-md bg-stone-950 px-5 text-sm font-bold text-white hover:bg-stone-800"
            >
              保存
            </button>
            <button
              type="button"
              onClick={download}
              className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
            >
              ダウンロード
            </button>
            <label className="flex h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-bold">
              <input
                type="checkbox"
                checked={autoDownload}
                onChange={(event) => setAutoDownload(event.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              生成後に自動ダウンロード
            </label>
            <label className="flex h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-bold">
              <input
                type="checkbox"
                checked={saveSourceLog}
                onChange={(event) => setSaveSourceLog(event.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              元ログも保存する
            </label>
            {sourceLogText && (
              <>
                <button
                  type="button"
                  onClick={downloadSourceLog}
                  className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50"
                >
                  元ログをダウンロード
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
                ? "選択済みフォルダ / YYYY-MM / filename.yaml"
                : "未選択の場合はブラウザのダウンロード保存"}
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
              <p className="mt-2 break-words text-sm font-bold">{memo?.filename ?? "未生成"}</p>
            </div>
            <div className="rounded-md border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold text-stone-500">type</p>
              <p className="mt-2 text-sm font-bold">{memo?.type ?? "-"}</p>
            </div>
            <div className="rounded-md border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold text-stone-500">status</p>
              <p className="mt-2 text-sm font-bold">{status || "待機中"}</p>
            </div>
          </div>

          <div>
            <label htmlFor="yaml-output" className="text-sm font-bold">
              生成YAML
            </label>
            <textarea
              id="yaml-output"
              value={yamlText}
              onChange={(event) => setYamlText(event.target.value)}
              className="mt-2 min-h-[600px] w-full resize-y rounded-md border border-stone-300 bg-[#111827] p-4 font-mono text-sm leading-6 text-stone-50 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              placeholder="生成されたYAMLがここに表示されます"
              spellCheck={false}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
