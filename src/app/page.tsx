import AstroForm from "@/components/AstroForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-none">nanami-products</h1>
              <p className="text-xs text-gray-500 mt-0.5">占術データ生成デモ</p>
            </div>
          </div>
          <a
            href="https://chart.nanami-astro.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            APIについて →
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* hero description */}
        <div className="bg-white border border-indigo-100 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            AIへ渡す占術データを生成する
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            このデモアプリは、nanami-products APIで計算済みの占術データを生成し、AIに渡しやすい形式で表示します。<br />
            AIには天体位置や命式を計算させず、<strong className="text-indigo-700">計算済みデータをもとに解釈</strong>させることで、ハルシネーションを減らすことを目的としています。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { icon: "🌟", text: "西洋占星術（ネイタルチャート）" },
              { icon: "🀄", text: "四柱推命（命式・大運）" },
              { icon: "🌙", text: "トランジット（天体通過）" },
              { icon: "✨", text: "統合分析（3占術まとめて）" },
            ].map((item) => (
              <span key={item.text} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                {item.icon} {item.text}
              </span>
            ))}
          </div>
        </div>

        {/* how to use */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { step: "1", title: "出生情報を入力", desc: "生年月日・出生地・性別など" },
            { step: "2", title: "データを生成",   desc: "APIが天体計算を実行" },
            { step: "3", title: "AIに貼り付け",   desc: "プロンプトをコピーして完了" },
          ].map((s) => (
            <div key={s.step} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mx-auto mb-2">
                {s.step}
              </div>
              <p className="text-sm font-semibold text-gray-800">{s.title}</p>
              <p className="text-xs text-gray-500 mt-1">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* main form */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <AstroForm />
        </div>
      </main>

      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center space-y-3">
          <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-500">
            <a href="https://chart.nanami-astro.com/manual/api" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">API仕様書</a>
            <a href="https://chart.nanami-astro.com/api-sandbox" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">公式サンドボックス</a>
            <a href="https://chart.nanami-astro.com/api-key/start" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">APIキーを取得する</a>
          </div>
          <p className="text-xs text-gray-400">
            Powered by nanami-products API — 占術計算エンジン
          </p>
        </div>
      </footer>
    </div>
  );
}
