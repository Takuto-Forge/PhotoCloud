import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PhotoCloud",
  description: "家族専用の写真・動画バックアップサービス",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
