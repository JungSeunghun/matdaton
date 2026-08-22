import type { Metadata } from "next";
import NavTabs from "./components/nav-tabs";
import "./globals.css";

export const metadata: Metadata = {
  title: "First Move — 아침 30분을 90초로",
  description: "매일 아침 하루의 첫 30분을 90초로 컴파일하는 개인 업무 준비 에이전트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <NavTabs />
        {children}
        <footer className="site-footer">
          <strong>First Move</strong>
          <span>맛다톤 2026 · Next.js · Azure</span>
        </footer>
      </body>
    </html>
  );
}
