import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI引き継ぎメモ生成",
  description: "会話ログから後日見返すためのYAML引き継ぎメモを生成し、ローカルまたは同期フォルダへ保存するツールです。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
