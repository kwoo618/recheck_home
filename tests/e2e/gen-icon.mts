/**
 * 아이콘·로고 파생 파일 생성 — 원본은 `brand/` (배포되지 않는 레포 루트 폴더)
 *
 * 실행: npm run icon:gen
 *
 * 만드는 것
 *   app/icon.png                512×512  탭 아이콘 · manifest any · SW 셸 캐시(/icon.png)
 *   public/icon-192.png         192×192  manifest any
 *   public/icon-maskable-512.png 512×512 manifest maskable (안전 영역 안에 그림)
 *   app/apple-icon.png          180×180  iOS 홈 화면
 *   components/screens/_parts/logo-cream@2x.png  머리글 로고 (표시 높이 44px의 2배)
 *   app/_og/logo-brown.png      링크 미리보기(app/opengraph-image.tsx)용
 *
 * ★ 새 의존성을 넣지 않으려고 **이미 있는 Playwright**의 canvas 로 자르고 줄인다.
 *   (sharp·resvg 같은 이미지 라이브러리를 추가하지 않았다)
 * ★ 원본은 public/ 밖에 둔다. 배포되는 것은 여기서 줄여 만든 파일뿐이어야 한다.
 * ★ 원본 PNG 는 위아래 여백이 크고 그림이 가운데에 있지 않다. 알파로 그림 영역을 찾아
 *   잘라낸 뒤 배치한다 — 원본 좌표를 숫자로 박지 않는다.
 * ★ 아이콘 바탕은 --rc-paper(#F5EBDD) 정사각형. 투명이면 다크 탭 바에서 갈색이 묻힌다.
 *   모서리를 둥글리지 않는다 — iOS·안드로이드 런처가 각자 모양으로 자른다.
 *
 * 원본을 바꾸면 이 스크립트를 다시 돌린다. 파생 PNG 를 손으로 편집하지 말 것.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const PAPER = '#F5EBDD'; // --rc-paper

type Job = {
  src: string;
  out: string;
  /** 정사각형 아이콘: 한 변 · 그림이 차지하는 비율(긴 변 기준) · 바탕색 */
  square?: { size: number; fill: number; background: string };
  /** 가로형 로고: 잘라낸 그림의 높이(px). 바탕은 투명 그대로 */
  height?: number;
};

const JOBS: Job[] = [
  { src: 'brand/icon.png', out: 'app/icon.png', square: { size: 512, fill: 0.8, background: PAPER } },
  { src: 'brand/icon.png', out: 'public/icon-192.png', square: { size: 192, fill: 0.8, background: PAPER } },
  // maskable 안전 영역 = 가운데 지름 80% 원. 그림의 대각선이 그 원 안에 들어가도록 0.8/√2 ≈ 0.56
  { src: 'brand/icon.png', out: 'public/icon-maskable-512.png', square: { size: 512, fill: 0.56, background: PAPER } },
  // iOS 는 모서리를 크게 둥글린다 — 그림이 모서리에 닿지 않게 any 보다 조금 작게
  { src: 'brand/icon.png', out: 'app/apple-icon.png', square: { size: 180, fill: 0.72, background: PAPER } },
  { src: 'brand/logo-cream.png', out: 'components/screens/_parts/logo-cream@2x.png', height: 88 },
  { src: 'brand/logo-brown.png', out: 'app/_og/logo-brown.png', height: 220 },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const job of JOBS) {
  const dataUrl = `data:image/png;base64,${readFileSync(job.src).toString('base64')}`;
  const result: string = await page.evaluate(
    async ({ dataUrl, square, height }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();

      // 1) 알파로 그림 영역 찾기
      const full = document.createElement('canvas');
      full.width = img.width;
      full.height = img.height;
      const fctx = full.getContext('2d')!;
      fctx.drawImage(img, 0, 0);
      const { data, width: w, height: h } = fctx.getImageData(0, 0, img.width, img.height);
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;

      // 2) 반씩 줄여 가며 축소 — 한 번에 크게 줄이면 가는 선이 깨진다
      const scaleTo = (targetW: number, targetH: number) => {
        let cur = document.createElement('canvas');
        cur.width = bw;
        cur.height = bh;
        cur.getContext('2d')!.drawImage(full, minX, minY, bw, bh, 0, 0, bw, bh);
        while (cur.width / 2 > targetW) {
          const next = document.createElement('canvas');
          next.width = Math.round(cur.width / 2);
          next.height = Math.round(cur.height / 2);
          const c = next.getContext('2d')!;
          c.imageSmoothingQuality = 'high';
          c.drawImage(cur, 0, 0, next.width, next.height);
          cur = next;
        }
        const out = document.createElement('canvas');
        out.width = targetW;
        out.height = targetH;
        const c = out.getContext('2d')!;
        c.imageSmoothingQuality = 'high';
        c.drawImage(cur, 0, 0, targetW, targetH);
        return out;
      };

      if (square) {
        const k = (square.size * square.fill) / Math.max(bw, bh);
        const tw = Math.round(bw * k);
        const th = Math.round(bh * k);
        const art = scaleTo(tw, th);
        const out = document.createElement('canvas');
        out.width = square.size;
        out.height = square.size;
        const c = out.getContext('2d')!;
        c.fillStyle = square.background;
        c.fillRect(0, 0, square.size, square.size);
        c.drawImage(art, Math.round((square.size - tw) / 2), Math.round((square.size - th) / 2));
        return out.toDataURL('image/png');
      }

      const th = height!;
      const tw = Math.round((bw * th) / bh);
      return scaleTo(tw, th).toDataURL('image/png');
    },
    { dataUrl, square: job.square, height: job.height },
  );

  const png = Buffer.from(result.split(',')[1], 'base64');
  writeFileSync(job.out, png);
  console.log(`${job.out} ← ${job.src} (${png.length.toLocaleString()} B)`);
}

await browser.close();
