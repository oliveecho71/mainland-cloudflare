import type { Metadata } from "next";
import "./globals.css";
import "./mobile-fix.css";
import "./course-editor.css";

export const metadata: Metadata = {
  title: "实战跟拍｜课程排期与约课",
  description: "查看展会与活动拍摄实战课程，报名学员可在线预约。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
