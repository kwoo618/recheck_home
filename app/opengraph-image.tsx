import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * OG 이미지 — 코드로 그린다. 로고만 그림이고, 부제는 글자다.
 *
 * ★ 로고는 brand/logo-brown.png 원본에서 npm run icon:gen 으로 줄여 만든 app/_og/logo-brown.png 를 쓴다.
 *   원본(1672×941, 위아래 여백 포함)을 그대로 넣지 않는다.
 *
 * ★ 부제를 코드로 두는 이유: 한글이다. 생성형 이미지는 한글 자소를 깨뜨리고,
 *   손으로 만든 PNG 는 문구가 바뀔 때마다 다시 만들어야 한다.
 *
 * ★ 폰트를 저장소에 넣은 이유: ImageResponse 의 렌더러(Satori)는 폰트 버퍼를
 *   직접 받아야 하고, 기본 폰트에는 한글 글리프가 없다(빈 네모로 나온다).
 *   빌드 때 구글 폰트를 fetch 하면 네트워크가 빌드 성공 여부를 좌우하므로,
 *   **쓰는 글자만 담은 서브셋**(약 49KB)을 받아 `app/_og/` 에 넣었다.
 *   문구를 바꾸면 글리프가 없어 그 글자만 빈 네모가 된다 — 서브셋을 다시 받아야 한다.
 *   (받는 법은 `docs/v1/ARCHITECTURE.md` 참조)
 *
 * ★ 색은 팔레트 값만 쓴다 — paper #F5EBDD · ink-soft #6B5B4B.
 * ★ 문구에 "안전한 · 추천 · 찾아드립니다"를 쓰지 않는다. 이 서비스는 찾아주지도,
 *   추천하지도, 안전을 보증하지도 않는다 (R1).
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Sealook Homes(씰룩홈즈) — 계약 전 2차 검증';

const PAPER = '#F5EBDD'; // --rc-paper
const INK_SOFT = '#6B5B4B'; // --rc-ink-soft

// app/_og/logo-brown.png 의 실제 크기 (icon:gen 이 높이 220 으로 만든다)
const LOGO_W = 783;
const LOGO_H = 220;

export default async function OpengraphImage() {
  const [font, logo] = await Promise.all([
    readFile(join(process.cwd(), 'app/_og/noto-kr-700-subset.ttf')),
    readFile(join(process.cwd(), 'app/_og/logo-brown.png')),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: PAPER,
          fontFamily: 'NotoKR',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori 는 <img> 만 받는다 */}
        <img src={logoSrc} width={LOGO_W} height={LOGO_H} alt="" />

        <div style={{ display: 'flex', marginTop: 40, fontSize: 46, color: INK_SOFT }}>
          계약 전 2차 검증
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'NotoKR', data: font, weight: 700, style: 'normal' }],
    },
  );
}
