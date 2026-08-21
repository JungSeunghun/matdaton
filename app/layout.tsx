import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "맛다톤 2026",
  description: "맛다톤 2026 팀 MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
