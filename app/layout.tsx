import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 블로그 에디터",
  description: "사진과 장소를 주면 AI가 알아서 블로그 글을 작성합니다.",
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
