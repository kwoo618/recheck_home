/**
 * 대조 전 정규화 — 순수 함수 (R2 · V2-PLAN §4-1 "대조")
 *
 * document_fields.value 는 문서에 적힌 표기 그대로다(API-V2 §1). 같은 값이 다르게 적힌 것을
 * 같은 값으로 보기 위해 여기서만 표기를 푼다: 공백·괄호·전각 문자, 금액 단위(원·만·억·쉼표·₩),
 * 한글 금액, 면적 단위 표기, 층, 날짜, 성명 공백.
 *
 * ★ 못 푸는 표기는 null이다. 추정해서 숫자로 만들지 않는다 (R8).
 *   null을 받은 쪽(compare.ts)은 different가 아니라 needs_review로 간다 — 오탐도 판정이다 (R1).
 * ★ ㎡ ↔ 평은 한쪽이 평, 다른 쪽이 ㎡일 때만 환산해 본다(2026-10-05 결정 B안 — INFRA 결정 로그).
 *   맞으면 same, 아니면 needs_review. 이 조합은 different를 내지 않는다(sqmMatchesPyeong).
 * ★ AI·fetch·DB·랜덤·시계 금지.
 */

/** 전각·호환 문자를 기본형으로 (㈜→(주), ㎡→m2, （）→(), ￦→₩, 전각 숫자→숫자) */
export function nfkc(raw: string): string {
  return raw.normalize('NFKC');
}

/** 비교용 압축 — NFKC 후 모든 공백·쉼표 제거 */
export function compact(raw: string): string {
  return nfkc(raw).replace(/[\s,]+/g, '');
}

/** 괄호와 그 안 내용을 뺀다 (중첩은 다루지 않는다) */
export function stripParens(s: string): string {
  return s.replace(/\([^()]*\)/g, '').replace(/\[[^[\]]*\]/g, '');
}

/* ── 금액 ──────────────────────────────────────────────────── */

export type ParsedAmount = {
  /** 원 단위 정수 */
  won: number;
  /**
   * 단위가 적혀 있었는가 (원·₩·만·억·조).
   * "500"처럼 숫자만 있으면 만원인지 원인지 모른다 — 단위를 아는 값과 비교하지 않는다 (R8).
   */
  unitKnown: boolean;
};

const KR_DIGIT: Record<string, number> = {
  영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9,
};
const KR_SMALL_UNIT: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };

/**
 * 만 미만 한 묶음. "3천5백" · "삼천" · "천" · "3000" · "1.5"
 * 아라비아 숫자만 있는 묶음은 크기 제한이 없다("3000만"의 3000).
 */
function parseGroup(g: string): number | null {
  if (g === '') return null;
  if (/^\d+(\.\d+)?$/.test(g)) return Number(g);

  let total = 0;
  let cur: number | null = null;
  let i = 0;
  while (i < g.length) {
    const ch = g[i];
    const digits = /^\d+/.exec(g.slice(i));
    if (digits) {
      if (cur !== null) return null;
      cur = Number(digits[0]);
      i += digits[0].length;
      continue;
    }
    if (ch in KR_DIGIT) {
      if (cur !== null) return null; // "삼삼" 같은 나열은 금액 표기가 아니다
      cur = KR_DIGIT[ch];
      i += 1;
      continue;
    }
    if (ch in KR_SMALL_UNIT) {
      total += (cur ?? 1) * KR_SMALL_UNIT[ch];
      cur = null;
      i += 1;
      continue;
    }
    return null;
  }
  return total + (cur ?? 0);
}

const BIG_UNITS: [string, number][] = [
  ['조', 1_000_000_000_000],
  ['억', 100_000_000],
  ['만', 10_000],
];

/** 앞뒤 장식을 뗀 금액 본문 → 원. 실패 null */
function parseAmountCore(s: string): ParsedAmount | null {
  let body = s;
  let unitKnown = false;

  if (body.startsWith('₩')) {
    body = body.slice(1);
    unitKnown = true;
  }
  if (body.endsWith('원')) {
    body = body.slice(0, -1);
    unitKnown = true;
  }
  if (body === '') return null;

  let won = 0;
  let rest = body;
  for (const [unit, mult] of BIG_UNITS) {
    const at = rest.indexOf(unit);
    if (at === -1) continue;
    const head = rest.slice(0, at);
    // "만원"처럼 앞 숫자가 없으면 1 (일금 만원정). 숫자가 있는데 못 읽으면 실패
    const n = head === '' ? 1 : parseGroup(head);
    if (n === null) return null;
    won += n * mult;
    rest = rest.slice(at + 1);
    unitKnown = true;
  }
  if (rest !== '') {
    const n = parseGroup(rest);
    if (n === null) return null;
    won += n;
  }

  const rounded = Math.round(won);
  // 소수가 남으면(예: 1.23456원) 금액 표기가 아니다
  if (Math.abs(won - rounded) > 1e-6 || !Number.isSafeInteger(rounded)) return null;
  return { won: rounded, unitKnown };
}

/** "금"·"일금"·"월" 머리, "정"·"整"·"也" 꼬리를 뗀다 */
function stripAmountAffixes(s: string): string {
  return s
    .replace(/^(일금|금|월)/, '')
    .replace(/(정|整|也)$/, '');
}

/**
 * 금액 표기 → 원.
 *   "₩30,000,000" · "30,000,000원" · "3,000만원" · "1억 5천만원" · "금 삼천만원정" · "월 40만원"
 *   "금 삼천만원정 (₩30,000,000)"처럼 두 표기가 함께 있으면 둘이 같을 때만 그 값, 다르면 null.
 * 읽을 수 없으면 null ("협의" · "없음" · "-" 등).
 */
export function parseAmount(raw: string | null): ParsedAmount | null {
  if (raw === null) return null;
  const s = compact(raw);
  if (s === '') return null;

  const paren = /^(.*?)\((.*)\)$/.exec(s);
  if (paren) {
    const main = parseAmountCore(stripAmountAffixes(paren[1]));
    const inner = parseAmountCore(stripAmountAffixes(paren[2]));
    if (!main || !inner) return null;
    if (main.won !== inner.won) return null;
    return { won: main.won, unitKnown: main.unitKnown || inner.unitKnown };
  }
  return parseAmountCore(stripAmountAffixes(s));
}

/* ── 면적 ──────────────────────────────────────────────────── */

export type AreaUnit = 'sqm' | 'pyeong' | 'unknown';
export type ParsedArea = {
  value: number;
  /** 소수점 아래 자릿수 — 반올림 표기 비교에 쓴다 */
  decimals: number;
  unit: AreaUnit;
};

/** "84.97㎡" · "84.97 m²" · "84.97제곱미터" · "전용 84.97㎡" · "25평" · "84.97" */
export function parseArea(raw: string | null): ParsedArea | null {
  if (raw === null) return null;
  const s = compact(raw).replace(/^전용(면적)?:?/, '');
  const m = /^(\d+(?:\.(\d+))?)(m2|제곱미터|평방미터|평)?$/i.exec(s);
  if (!m) return null;
  const unitText = (m[3] ?? '').toLowerCase();
  const unit: AreaUnit = unitText === '' ? 'unknown' : unitText === '평' ? 'pyeong' : 'sqm';
  return { value: Number(m[1]), decimals: m[2]?.length ?? 0, unit };
}

/**
 * 1평 = 400/121 ㎡ (≈ 3.3058㎡). 분수 그대로 둔다 — 소수로 끊으면 반올림 경계에서 결과가 바뀐다.
 *
 * 출처: 평은 법정 계량단위가 아니라서 법정 환산값이 없다. 그래서 단위 정의에서 도출한 값을 쓴다.
 *   1평 = 6자 × 6자, 1자 = 10/33 m → 1평 = (60/33)² = 3600/1089 = 400/121 ㎡.
 *   이 정의를 적은 법령 조문은 미확인이다 (R8 — 조문 번호를 지어 쓰지 않는다).
 */
export const PYEONG_IN_SQM = { num: 400, den: 121 } as const;

/** 소수 자릿수 표기 → 정수 (84.97, 2 → 8497). 부동소수 오차를 피하려고 문자열을 거친다 */
function scaled(value: number, decimals: number): bigint {
  return BigInt(value.toFixed(decimals).replace('.', ''));
}

/** 10^d (tsconfig target ES2017 — bigint 리터럴·** 를 쓰지 않는다) */
function pow10(d: number): bigint {
  return BigInt(`1${'0'.repeat(d)}`);
}

/**
 * ㎡ 값을 평으로 바꿔(× 121/400) **평 표기의 소수 자릿수**에 맞춰 반올림(사사오입)했을 때
 * 평 값과 같은가. 정수 산술만 쓴다 — .5 경계에서 부동소수가 결과를 뒤집지 않게.
 *
 * 같지 않다고 해서 다른 값이라는 뜻은 아니다(공급·전용 등 어느 면적을 적었는지 모른다).
 * 그래서 호출부는 false를 different가 아니라 needs_review로 보낸다 (R1).
 */
export function sqmMatchesPyeong(sqm: ParsedArea, pyeong: ParsedArea): boolean {
  // sqm = S / 10^ds, pyeong = P / 10^dp
  const S = scaled(sqm.value, sqm.decimals);
  const P = scaled(pyeong.value, pyeong.decimals);
  const tenDs = pow10(sqm.decimals);
  const tenDp = pow10(pyeong.decimals);
  const two = BigInt(2);
  const num = BigInt(PYEONG_IN_SQM.den); // 121
  const den = BigInt(PYEONG_IN_SQM.num); // 400
  // round(S·121 / (400·10^ds) · 10^dp) = floor((2·S·121·10^dp + 400·10^ds) / (2·400·10^ds))
  const rounded = (two * S * num * tenDp + den * tenDs) / (two * den * tenDs);
  return rounded === P;
}

/** 소수 자릿수에 맞춰 반올림 (부동소수 오차를 피하려고 문자열로) */
export function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

/* ── 층 ────────────────────────────────────────────────────── */

/**
 * "3층" · "3" · "제3층" · "지상3층" → 3, "지하1층" · "B1" → -1.
 * "반지하" · "옥탑" · "3/5층" · "고층"은 읽지 않는다(null) — 표기 체계가 다르다.
 */
export function parseFloor(raw: string | null): number | null {
  if (raw === null) return null;
  const s = compact(raw);
  const up = /^(?:지상|제)?(\d+)층?$/.exec(s);
  if (up) return Number(up[1]);
  const down = /^(?:지하|b)(\d+)층?$/i.exec(s);
  if (down) return -Number(down[1]);
  return null;
}

/* ── 날짜 ──────────────────────────────────────────────────── */

/**
 * "2026-10-01" · "2026.10.1" · "2026. 10. 1." · "2026/10/01" · "2026년 10월 1일" → "2026-10-01".
 * 두 자리 연도("26.10.01")는 세기를 추정해야 하므로 읽지 않는다 (R8).
 */
export function parseDate(raw: string | null): string | null {
  if (raw === null) return null;
  const s = compact(raw);
  const m =
    /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?$/.exec(s) ??
    /^(\d{4})년(\d{1,2})월(\d{1,2})일?$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/* ── 성명 ──────────────────────────────────────────────────── */

/** 가림 표시 — 가려진 성명은 같은지 알 수 없다 */
const MASK_CHARS = /[○◯●〇*＊×]/;

export type ParsedNames =
  | { kind: 'names'; names: string[] }
  /** 가려져 있거나 성명으로 읽을 수 없는 문자가 섞였다 */
  | { kind: 'unreadable' };

/**
 * 성명 표기 → 성명 목록.
 *   공백 제거 · "(인)"·"(서명)"·"印" 떼기 · ㈜/(주)/주식회사 → 한 표기.
 *   여러 명이면 쉼표·가운뎃점·"및"으로 나눈다.
 * 가림 문자(김○○)·괄호·숫자가 남으면 unreadable — 같다고도 다르다고도 하지 않는다.
 */
export function parseNames(raw: string | null): ParsedNames | null {
  if (raw === null) return null;
  const s = nfkc(raw).trim();
  if (s === '') return null;
  if (MASK_CHARS.test(s)) return { kind: 'unreadable' };

  const parts = s
    .split(/[,·、/]|\s및\s/)
    .map((p) =>
      p
        .replace(/\s+/g, '')
        .replace(/\((인|서명|印)\)$/, '')
        .replace(/印$/, '')
        .replace(/\(주\)|주식회사/g, '주식회사'),
    )
    .filter((p) => p !== '');

  if (parts.length === 0) return { kind: 'unreadable' };
  if (!parts.every((p) => /^[가-힣A-Za-z&.]+$/.test(p))) return { kind: 'unreadable' };
  return { kind: 'names', names: parts };
}

/* ── 용도 ──────────────────────────────────────────────────── */

/** 용도 표기 → 항목 집합(괄호 내용 제외). "제2종근린생활시설, 다가구주택" → 두 항목 */
export function splitUseItems(raw: string): string[] {
  return stripParens(nfkc(raw))
    .split(/[,·/]/)
    .map((p) => p.replace(/\s+/g, ''))
    .filter((p) => p !== '');
}
