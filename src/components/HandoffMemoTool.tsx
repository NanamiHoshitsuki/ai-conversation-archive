"use client";

import { useMemo, useState } from "react";
import { generateHandoffMemo, getMemoMonthFolder, memoToYaml, type HandoffMemo } from "@/lib/handoffMemo";

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
事業家なら business_opportunities、研究者なら research_opportunities、小説家なら story_ideas を使えるようにしたい。
会話ログそのものではなく、再利用価値のある成果物を保存する仕組みにしたい。`;

function downloadYaml(filename: string, yamlText: string) {
  const blob = new Blob([yamlText], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function writeYamlToDirectory(directory: WritableDirectoryHandle, memo: HandoffMemo, yamlText: string) {
  const monthDirectory = await directory.getDirectoryHandle(getMemoMonthFolder(memo), { create: true });
  const fileHandle = await monthDirectory.getFileHandle(memo.filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(yamlText);
  await writable.close();
}

export default function HandoffMemoTool() {
  const [conversationLog, setConversationLog] = useState("");
  const [memo, setMemo] = useState<HandoffMemo | null>(null);
  const [yamlText, setYamlText] = useState("");
  const [directoryHandle, setDirectoryHandle] = useState<WritableDirectoryHandle | null>(null);
  const [status, setStatus] = useState("");

  const canPickDirectory = useMemo(() => typeof window !== "undefined" && Boolean(window.showDirectoryPicker), []);

  function generate() {
    const source = conversationLog.trim();
    if (!source) {
      setStatus("会話ログを貼り付けてください。");
      return;
    }

    const nextMemo = generateHandoffMemo(source);
    const nextYaml = memoToYaml(nextMemo);
    setMemo(nextMemo);
    setYamlText(nextYaml);
    setStatus("YAMLを生成しました。");
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
      nextMemo = generateHandoffMemo(conversationLog);
      nextYaml = memoToYaml(nextMemo);
      setMemo(nextMemo);
      setYamlText(nextYaml);
    }

    if (directoryHandle) {
      try {
        await writeYamlToDirectory(directoryHandle, nextMemo, nextYaml);
        setStatus(`${getMemoMonthFolder(nextMemo)}/${nextMemo.filename} に保存しました。`);
        return;
      } catch {
        setStatus("フォルダ保存に失敗しました。ダウンロード保存に切り替えます。");
      }
    }

    downloadYaml(nextMemo.filename, nextYaml);
    setStatus("YAMLをダウンロードしました。");
  }

  function download() {
    if (!memo || !yamlText) {
      setStatus("先にYAMLを生成してください。");
      return;
    }
    downloadYaml(memo.filename, yamlText);
    setStatus("YAMLをダウンロードしました。");
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Reusable conversation archive</p>
            <h1 className="mt-1 text-xl font-bold">AI会話知識アーカイブ</h1>
          </div>
          <button
            type="button"
            onClick={() => setConversationLog(sampleLog)}
            className="h-10 rounded-md border border-stone-300 bg-white px-4 text-sm font-semibold hover:bg-stone-50"
          >
            サンプル入力
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="space-y-4">
          <div>
            <label htmlFor="conversation-log" className="text-sm font-bold">
              会話ログ
            </label>
            <textarea
              id="conversation-log"
              value={conversationLog}
              onChange={(event) => setConversationLog(event.target.value)}
              className="mt-2 min-h-[520px] w-full resize-y rounded-md border border-stone-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              placeholder="ChatGPTなどの会話ログをここに貼り付け"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generate}
              className="h-11 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
            >
              YAML生成
            </button>
            <button
              type="button"
              onClick={chooseDirectory}
              className="h-11 rounded-md border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canPickDirectory}
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
          </div>

          <div className="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700">
            <p className="font-semibold text-stone-950">保存先</p>
            <p className="mt-1">
              {directoryHandle
                ? "選択済みフォルダ / YYYY-MM / filename.yaml"
                : "未選択の場合はブラウザのダウンロード保存"}
            </p>
            {!canPickDirectory && (
              <p className="mt-2 text-amber-700">
                このブラウザではフォルダ指定保存が使えないため、ダウンロード保存のみ有効です。
              </p>
            )}
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
