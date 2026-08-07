import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import MainLayout from "@/components/layout/main-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "万能导入",
  description: "万能导入 - 企业级数据导入平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider>
          <MainLayout>{children}</MainLayout>
          <Toaster position="top-right" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
