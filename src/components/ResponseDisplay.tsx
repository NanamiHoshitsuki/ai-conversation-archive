"use client";
import { useState } from "react";
import yaml from "js-yaml";
import CopyButton from "./CopyButton";
import type { ApiSuccessResponse, ApiType } from "@/lib/types";
import { generateAiPrompt } from "@/lib/promptGenerator";

interface Props {
  response: ApiSuccessResponse;
  apiType: ApiType;
  name?: string;
}

type Tab = "json" | "yaml" | "prompt";

export default function ResponseDisplay({ response, apiType, name }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("prompt");

  const jsonText = JSON.stringify(response, null, 2);
  const yamlText = yaml.dump(response, { lineWidth: -1, noRefs: true, skipInvalid: true });
  const promptText = generateAiPrompt(response, apiType, name);

  const tabs: { id: Tab; label: string; description: string }[] = [
    { id: "prompt", label: "AI貼り付け用プロンプト", description: "ChatGPT / Claudeにそのままコピペ" },
    { id: "yaml", label: "YAML形式", description: "構造化データ" },
    { id: "json", label: "JSON（生データ）", description: "開発者・確認用" },
  ];

  const currentText = activeTab === "json" ? jsonText : activeTab === "yaml" ? yamlText : promptText;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">占術データが生成されました</h2>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          取得成功
        </span>
      </div>

      {/* tab buttons */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors text-center ${
              activeTab === tab.id
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            <div>{tab.label}</div>
            <div className={`text-xs mt-0.5 ${activeTab === tab.id ? "text-indigo-500" : "text-gray-400"}`}>
              {tab.description}
            </div>
          </button>
        ))}
      </div>

      {/* action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {activeTab === "prompt" && "下のテキストをまるごとコピーして、ChatGPT / Claude に貼り付けてください。"}
          {activeTab === "yaml" && "YAML形式の計算済みデータです。"}
          {activeTab === "json" && "APIの生レスポンスデータです。"}
        </p>
        <CopyButton text={currentText} label="全文コピー" />
      </div>

      {/* content */}
      <div className="relative">
        <pre className={`rounded-xl border border-gray-200 p-4 text-sm overflow-auto max-h-[60vh] leading-relaxed whitespace-pre-wrap break-words ${
          activeTab === "prompt" ? "bg-amber-50 text-gray-800 font-sans" : "bg-gray-900 text-gray-100 font-mono"
        }`}>
          {currentText}
        </pre>
      </div>

      {activeTab === "prompt" && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-800">
          <p className="font-medium mb-1">AIに渡す際のポイント</p>
          <ul className="list-disc list-inside space-y-1 text-indigo-700">
            <li>上のテキストをまるごとコピーして、ChatGPTまたはClaudeに貼り付けるだけです</li>
            <li>AIには「生年月日から再計算しない」よう指示が含まれています</li>
            <li>計算済みデータを根拠にするため、ハルシネーションを抑えた解釈が期待できます</li>
          </ul>
        </div>
      )}
    </div>
  );
}
