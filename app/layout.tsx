import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * ★ 문구 규약: "안전한 · 추천 · 찾아드립니다"를 쓰지 않는다.
 *   이 서비스는 매물을 찾아주지도, 추천하지도, 안전을 보증하지도 않는다 (R1).
 *   랜딩 카피와 같은 축으로 — **"찾은 집을, 계약 전에 다시 확인하세요."**
 *
 * ★ metadataBase 가 없으면 OG 이미지 URL 이 상대경로로 나가 카카오톡·슬랙 같은
 *   외부 미리보기에서 이미지가 뜨지 않는다. 배포 도메인을 기준으로 잡는다.
 *   (Vercel 프리뷰에서도 동작하도록 VERCEL_URL 을 먼저 본다)
 */
const siteUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://recheck-home.vercel.app";

const title = "리:체크 — 계약 전 2차 검증";
const description =
  "찾은 집을, 계약 전에 다시 확인하세요. 직방·다방·중개사에서 찾아온 매물의 확인 항목을 규칙으로 정리해 드립니다. 매물을 추천하지 않습니다.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "리:체크",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "리:체크",
    title,
    description,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

// 모바일 우선 — 현장(방문 직후)에서 쓰는 화면이 기본이다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
