/**
 * 탭 아이콘 생성 — `app/icon.png` (512×512)
 *
 * 실행: npm run icon:gen
 *
 * ★ 새 의존성을 넣지 않으려고 **이미 있는 Playwright**로 SVG를 래스터화한다.
 *   (sharp·resvg 같은 이미지 라이브러리를 추가하지 않았다)
 * ★ 색은 팔레트 값만 쓴다 — `--rc-teal #145c54` · `--rc-paper #f6f5f1`.
 *   참고안의 녹색 #2D5234·갈색 점은 팔레트에 없는 값이라 형태만 가져왔다.
 * ★ 배경을 투명이 아니라 종이색 라운드 사각형으로 둔 이유:
 *   투명 배경이면 다크 테마 탭 바에서 짙은 teal 이 배경에 묻힌다.
 *   발표에서 브라우저를 띄우므로 어느 테마에서든 보이는 쪽을 골랐다.
 *
 * 아이콘을 고치면 이 파일을 고치고 다시 돌린다. PNG 를 손으로 편집하지 말 것.
 */

import { chromium } from 'playwright';

const SIZE = 512;
const TEAL = '#145c54';   // --rc-teal
const PAPER = '#f6f5f1';  // --rc-paper

/*
 * 체크 하나 + 점 하나.
 * 점은 워드마크 "리:체크"의 콜론이다 (`.rc-logo-re` 가 "리:"를 teal 로 쓴다).
 */
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" ry="112" fill="${PAPER}"/>
  <circle cx="142" cy="160" r="42" fill="${TEAL}"/>
  <path d="M 128 288 L 212 372 L 386 150"
        fill="none" stroke="${TEAL}" stroke-width="58"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`.trim();

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});

await page.setContent(
  `<body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body>`,
  { waitUntil: 'load' },
);
await page.screenshot({ path: 'app/icon.png', omitBackground: true });
await browser.close();

console.log(`app/icon.png ${SIZE}×${SIZE} 생성 완료`);
