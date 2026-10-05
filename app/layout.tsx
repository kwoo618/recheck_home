import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OfflineSync } from "./_lib/offline-sync";

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
 *
 * ★ VERCEL_URL 을 그냥 쓰면 안 된다 — 그건 배포마다 바뀌는 **immutable 배포 URL**
 *   (recheck-home-qkj6ot0um-….vercel.app)이지 공유하는 주소가 아니다.
 *   실제로 처음엔 og:image 가 그 주소로 나갔다. 배포 보호가 켜지면 크롤러가 못 읽고,
 *   켜져 있지 않아도 링크마다 다른 도메인을 가리키게 된다.
 *   → 운영에서는 VERCEL_PROJECT_PRODUCTION_URL(고정 도메인)을 쓰고,
 *     프리뷰에서만 VERCEL_URL 로 떨어진다.
 */
const siteUrl =
  process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://recheck-home.vercel.app";

const title = "Sealook Homes(씰룩홈즈) — 계약 전 2차 검증";
const description =
  "찾은 집을, 계약 전에 다시 확인하세요. 부동산 앱이나 중개사무소에서 찾아온 매물의 확인 항목을 규칙으로 정리해 드립니다. 매물을 추천하지 않습니다.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Sealook Homes",
  // PWA (V2-PLAN §4-4). 아이콘은 app/icon.png 임시 사용 — 팀원 아이콘 대기
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "씰룩홈즈", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Sealook Homes",
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
  themeColor: "#f6f5f1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <OfflineSync />
      </body>
    </html>
  );
}
