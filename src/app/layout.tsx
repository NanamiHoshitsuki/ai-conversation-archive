import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI会話知識アーカイブ",
  description: "AIとの会話から再利用可能な知識メモを抽出して保存するローカルファーストのアーカイブツールです。",
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
