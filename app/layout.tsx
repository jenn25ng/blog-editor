import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "네이버 블로그 AI 에디터",
  description:
    "사진·장소·키워드를 주면 네이버 검색 상위노출에 맞춰 튜닝된 블로그 글을 작성합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
