import type { FieldBbox } from '@/db/schema';

/**
 * PDF 텍스트 레이어 → 텍스트·토큰 위치 (V2-PLAN §4-1 "PDF 텍스트 추출")
 *
 * pdf.js를 부르는 쪽은 lib/client/pdf-text.ts 이고, 여기는 그 결과를 다루는 순수 함수만 둔다
 * (브라우저 없이 테스트하기 위해서).
 *
 * ★ bbox 좌표계: **페이지 대비 비율(0~1)**, 원점은 왼쪽 위. page는 1부터.
 *   렌더 배율과 무관하게 하이라이트를 그릴 수 있게 비율로 저장한다.
 * ★ 값 → 위치 매칭이 확실하지 않으면 null이다. 화면은 "위치 추정"으로 표시한다.
 *   엉뚱한 곳을 칠하는 것은 틀린 사실을 보여 주는 것과 같다 (R1 — 오탐도 판정이다).
 */

export type PdfToken = { page: number; str: string; bbox: FieldBbox | null };
export type PdfPageText = { page: number; text: string };

export type PdfTextFailure = 'no_text' | 'encrypted' | 'invalid' | 'load_failed';

export type PdfTextResult =
  | { ok: true; text: string; pages: PdfPageText[]; tokens: PdfToken[] }
  | { ok: false; reason: PdfTextFailure };

/** 화면 공통 문구 — 실패 이유와 관계없이 다음 행동은 같다 */
export const PDF_TEXT_FALLBACK_MESSAGE = '텍스트를 찾지 못했습니다. 직접 입력해 주세요';

/** 실패 이유 보조 설명 (한 줄) */
export const PDF_TEXT_FAILURE_DETAIL: Record<PdfTextFailure, string> = {
  no_text: '이 PDF에는 글자 정보(텍스트 레이어)가 없습니다. 스캔·촬영본일 수 있습니다.',
  encrypted: '암호가 걸린 PDF라 열지 못했습니다.',
  invalid: 'PDF 파일 형식을 읽지 못했습니다.',
  load_failed: 'PDF를 여는 중에 문제가 생겼습니다.',
};

/** pdf.js가 던지는 예외 → 실패 이유. 예외 클래스 이름으로만 가른다 */
export function failureFromError(err: unknown): PdfTextFailure {
  const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
  if (name === 'PasswordException') return 'encrypted';
  if (name === 'InvalidPDFException') return 'invalid';
  return 'load_failed';
}

type Matrix = readonly number[];

/**
 * 텍스트 항목 하나의 위치.
 * @param itemTransform  TextItem.transform — [a,b,c,d,e,f], (e,f)가 글자 기준선 왼쪽 점 (PDF 좌표)
 * @param width/height   TextItem.width/height (PDF 좌표 단위)
 * @param viewport       page.getViewport({scale:1}) 의 transform·width·height — 회전·원점 보정
 */
export function itemBbox(
  page: number,
  itemTransform: Matrix,
  width: number,
  height: number,
  viewport: { transform: Matrix; width: number; height: number },
): FieldBbox | null {
  const [, , , , e, f] = itemTransform;
  const [va, vb, vc, vd, ve, vf] = viewport.transform;
  const h = height > 0 ? height : Math.hypot(itemTransform[2] ?? 0, itemTransform[3] ?? 0);

  const nums = [e, f, width, h, va, vb, vc, vd, ve, vf, viewport.width, viewport.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (width <= 0 || h <= 0 || viewport.width <= 0 || viewport.height <= 0) return null;

  const toView = (x: number, y: number) => [va * x + vc * y + ve, vb * x + vd * y + vf] as const;
  const [x1, y1] = toView(e, f);
  const [x2, y2] = toView(e + width, f + h);

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const bbox: FieldBbox = {
    page,
    x: left / viewport.width,
    y: top / viewport.height,
    w: Math.abs(x2 - x1) / viewport.width,
    h: Math.abs(y2 - y1) / viewport.height,
  };
  return bbox;
}

/** 한 페이지의 텍스트 항목을 이어 붙인다. hasEOL이면 줄을 바꾼다 */
export function buildPageText(items: readonly { str: string; hasEOL?: boolean }[]): string {
  return items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join('');
}

/** 페이지 텍스트가 전부 공백이면 텍스트 레이어가 없는 것으로 본다 */
export function toTextResult(pages: PdfPageText[], tokens: PdfToken[]): PdfTextResult {
  const text = pages.map((p) => p.text).join('\n\n');
  if (text.replace(/\s+/g, '') === '') return { ok: false, reason: 'no_text' };
  return { ok: true, text, pages, tokens };
}

const compact = (s: string) => s.replace(/\s+/g, '');

/** 이보다 짧은 값("3", "층")은 문서 곳곳에 있어 위치를 특정할 수 없다 */
const MIN_MATCH_LENGTH = 2;

/**
 * 구조화된 값이 원문 어디에 있는지 찾는다.
 * 문서 전체에서 **정확히 한 곳**에 있고 그 구간 토큰의 bbox가 전부 있을 때만 합쳐서 돌려준다.
 * 두 곳 이상이거나 못 찾으면 null ("위치 추정").
 */
export function findValueBbox(tokens: readonly PdfToken[], value: string | null): FieldBbox | null {
  if (!value) return null;
  const needle = compact(value);
  if (needle.length < MIN_MATCH_LENGTH) return null;

  const pages = [...new Set(tokens.map((t) => t.page))];
  let found: FieldBbox | null = null;
  let hits = 0;

  for (const page of pages) {
    const pageTokens = tokens.filter((t) => t.page === page);
    // 공백을 뺀 페이지 문자열의 각 글자가 어느 토큰에서 왔는지
    let joined = '';
    const owner: number[] = [];
    pageTokens.forEach((t, i) => {
      const c = compact(t.str);
      joined += c;
      for (let k = 0; k < c.length; k += 1) owner.push(i);
    });

    let from = joined.indexOf(needle);
    while (from !== -1) {
      hits += 1;
      if (hits > 1) return null;

      const covered = [...new Set(owner.slice(from, from + needle.length))].map((i) => pageTokens[i]);
      found = unionBbox(covered.map((t) => t.bbox));
      from = joined.indexOf(needle, from + 1);
    }
  }

  return found;
}

function unionBbox(boxes: (FieldBbox | null)[]): FieldBbox | null {
  if (boxes.length === 0 || boxes.some((b) => b === null)) return null;
  const bs = boxes as FieldBbox[];
  const left = Math.min(...bs.map((b) => b.x));
  const top = Math.min(...bs.map((b) => b.y));
  const right = Math.max(...bs.map((b) => b.x + b.w));
  const bottom = Math.max(...bs.map((b) => b.y + b.h));
  return { page: bs[0].page, x: left, y: top, w: right - left, h: bottom - top };
}
