# nanami-products API デモアプリ

nanami-products の占星術・四柱推命 API を使って、計算済みの占術データを生成し、AI（ChatGPT / Claude）へ渡しやすい形式で表示するデモアプリです。

## 概要

- **西洋占星術**（ネイタルチャート・天体位置・アスペクト）
- **四柱推命**（命式・大運・十神・五行バランス）
- **トランジット**（指定日の天体配置）
- **統合分析**（3占術を一度に取得）

AIには天体位置や命式を再計算させず、**計算済みデータをもとに解釈**させることでハルシネーションを抑えます。

---

## 起動方法

### 必要要件

- Node.js 18+
- npm 9+

### インストール

```bash
git clone <このリポジトリ>
cd nanami-demo
npm install
```

### 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` を編集して APIキーを設定します：

```env
NANAMI_API_KEY=np_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NANAMI_API_BASE_URL=https://chart.nanami-astro.com
```

> APIキーは [こちら](https://chart.nanami-astro.com/api-key/start) から購入・取得できます。  
> **APIキーなしでも**サンドボックスモードで動作確認できます。

### 開発サーバー起動

```bash
npm run dev
```

`http://localhost:3000` でアクセスできます。

### 本番ビルド

```bash
npm run build
npm start
```

---

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `NANAMI_API_KEY` | 任意 | nanami-products の APIキー（`np_` で始まる文字列） |
| `NANAMI_API_BASE_URL` | 任意 | APIのベースURL（デフォルト: `https://chart.nanami-astro.com`） |

> `NANAMI_API_KEY` は**サーバーサイドでのみ使用**されます。ブラウザには送信されません。

---

## 使い方

1. **モード選択**  
   - **無料サンドボックス**: APIキー不要。固定サンプルデータで出力形式を確認
   - **APIキー版**: リアルタイム計算。本人の占術データを生成

2. **占術データの種類を選択**  
   `統合分析（おすすめ）` / `西洋占星術` / `四柱推命` / `トランジット`

3. **出生情報を入力**  
   生年月日・出生時間・出生地（「座標を取得」ボタンで緯度経度を自動入力）・性別・タイムゾーン

4. **「占術データを生成する」をクリック**

5. **結果をコピー**  
   - **AI貼り付け用プロンプト**: ChatGPT / Claude にそのまま貼り付け可能
   - **YAML形式**: 構造化データ
   - **JSON（生データ）**: 開発者・確認用

---

## APIとの通信について

```
ブラウザ → /api/astro (Next.js APIルート) → nanami-products API
```

APIキーはサーバーサイドの環境変数から読み込まれるため、**ブラウザ側に漏れません**。

---

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx              # メインページ
│   ├── layout.tsx            # ルートレイアウト
│   └── api/
│       ├── astro/route.ts    # APIプロキシ（X-API-Key付与）
│       └── geocode/route.ts  # 地名→座標変換（Nominatim使用）
├── components/
│   ├── AstroForm.tsx         # メインフォームコンポーネント
│   ├── ResponseDisplay.tsx   # レスポンス表示（JSON/YAML/AIプロンプト）
│   └── CopyButton.tsx        # コピーボタン
└── lib/
    ├── types.ts              # 型定義
    ├── errorMessages.ts      # エラーメッセージ（ユーザー向け）
    └── promptGenerator.ts    # AIプロンプト生成ロジック
```

---

## APIリファレンス

- API仕様書: https://chart.nanami-astro.com/manual/api
- 公式サンドボックス: https://chart.nanami-astro.com/api-sandbox
- APIキー取得: https://chart.nanami-astro.com/api-key/start

---

## クレジット消費量（APIキー版）

| エンドポイント | 消費クレジット |
|---------------|--------------|
| 西洋占星術 | 1 クレジット |
| 四柱推命 | 1 クレジット |
| トランジット | 1 クレジット |
| 統合分析 | 3 クレジット |
# ai-conversation-archive
