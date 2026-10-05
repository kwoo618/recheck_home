import type { DealType, DiscrepancyStatus, DocumentKind } from '@/db/schema';
import { FIELD_SPECS, type DocumentFieldKey } from '@/lib/documents/fields';
import {
  compact,
  parseAmount,
  parseArea,
  parseDate,
  parseFloor,
  parseNames,
  roundTo,
  splitUseItems,
  sqmMatchesPyeong,
} from './normalize';
import { COMPARE_PAIRS, type ComparePair, type CompareType } from './pairs';

/**
 * 문서 대조 — 순수 함수 (R2 · V2-PLAN §4-1 · API-V2 §4)
 *
 * status 는 이 파일만 정한다. 서버 액션은 DB에서 필드를 읽어 넘기고 결과를 저장만 한다.
 *
 *   same                    정규화 후 같다
 *   different               정규화 후 다르다 — 표기 체계가 같은 필드(성명·금액·면적·용도·층·날짜)에서만 (R10)
 *   needs_review            같은지 자동으로 가리지 않았다 — 두 표기를 나란히 보여 준다.
 *                           주소 계열은 같지 않으면 항상 여기다(R10). 그 밖의 필드도 단위를 모르거나
 *                           가려진 성명처럼 **읽을 수 없는 표기**면 different 대신 여기로 온다 (R1 — 오탐도 판정이다)
 *   missing_not_found       한쪽(또는 양쪽)에서 값을 찾지 못했다
 *   missing_not_applicable  그 문서·거래 유형에는 원래 없는 칸이다
 *
 * ★ 심각도·순위·점수 없음 (R1). 결과 순서는 COMPARE_PAIRS 순서 그대로.
 * ★ AI·fetch·DB·랜덤·시계 금지.
 */

export type ValueStatus = Exclude<DiscrepancyStatus, 'missing_not_applicable' | 'missing_not_found'>;

/* ── 값 두 개 비교 (둘 다 null 아님) ─────────────────────────── */

function compareAddress(a: string, b: string): ValueStatus {
  // R10: 주소는 절대 different를 내지 않는다
  return compact(a) === compact(b) ? 'same' : 'needs_review';
}

function compareNames(a: string, b: string): ValueStatus {
  const pa = parseNames(a);
  const pb = parseNames(b);
  if (!pa || !pb || pa.kind === 'unreadable' || pb.kind === 'unreadable') return 'needs_review';
  const sa = [...new Set(pa.names)].sort();
  const sb = [...new Set(pb.names)].sort();
  const equal = sa.length === sb.length && sa.every((n, i) => n === sb[i]);
  if (equal) return 'same';
  // 여러 명(공유·공동 임대인)이 섞이면 일부만 겹치는 경우가 있다 — 다르다고 단정하지 않는다
  if (sa.length > 1 || sb.length > 1) return 'needs_review';
  return 'different';
}

function compareAmount(a: string, b: string): ValueStatus {
  const pa = parseAmount(a);
  const pb = parseAmount(b);
  if (pa && pb) {
    if (pa.unitKnown && pb.unitKnown) return pa.won === pb.won ? 'same' : 'different';
    // 단위가 없는 숫자끼리 — 적힌 숫자가 같으면 같은 표기다. 다르면 단위를 몰라 가리지 않는다
    if (!pa.unitKnown && !pb.unitKnown && pa.won === pb.won) return 'same';
    return 'needs_review';
  }
  return compact(a) === compact(b) ? 'same' : 'needs_review';
}

function compareArea(a: string, b: string): ValueStatus {
  const pa = parseArea(a);
  const pb = parseArea(b);
  // 평 ↔ ㎡ — 환산해 맞으면 same, 아니면 needs_review. different는 내지 않는다 (2026-10-05 B안)
  if (pa && pb && pa.unit !== pb.unit && pa.unit !== 'unknown' && pb.unit !== 'unknown') {
    const [sqm, pyeong] = pa.unit === 'sqm' ? [pa, pb] : [pb, pa];
    return sqmMatchesPyeong(sqm, pyeong) ? 'same' : 'needs_review';
  }
  if (pa && pb && pa.unit === pb.unit && pa.unit !== 'unknown') {
    if (pa.value === pb.value) return 'same';
    // 자릿수가 다르면 덜 정밀한 쪽에 맞춰 반올림해 본다. 같아지면 반올림 표기일 수 있다
    if (pa.decimals !== pb.decimals) {
      const d = Math.min(pa.decimals, pb.decimals);
      if (roundTo(pa.value, d) === roundTo(pb.value, d)) return 'needs_review';
    }
    return 'different';
  }
  if (pa && pb && pa.unit === 'unknown' && pb.unit === 'unknown' && pa.value === pb.value) return 'same';
  return compact(a) === compact(b) ? 'same' : 'needs_review';
}

function compareFloor(a: string, b: string): ValueStatus {
  const pa = parseFloor(a);
  const pb = parseFloor(b);
  if (pa !== null && pb !== null) return pa === pb ? 'same' : 'different';
  return compact(a) === compact(b) ? 'same' : 'needs_review';
}

function compareDate(a: string, b: string): ValueStatus {
  const pa = parseDate(a);
  const pb = parseDate(b);
  if (pa !== null && pb !== null) return pa === pb ? 'same' : 'different';
  return compact(a) === compact(b) ? 'same' : 'needs_review';
}

function compareUse(a: string, b: string): ValueStatus {
  if (compact(a) === compact(b)) return 'same';
  const sa = new Set(splitUseItems(a));
  const sb = new Set(splitUseItems(b));
  if (sa.size === 0 || sb.size === 0) return 'needs_review';
  // 괄호 보충만 다르거나("다가구주택(원룸)" / "다가구주택") 한쪽이 다른 쪽 목록에 들어 있으면 가리지 않는다
  const overlap = [...sa].some((x) => sb.has(x));
  return overlap ? 'needs_review' : 'different';
}

const BY_TYPE: Record<CompareType, (a: string, b: string) => ValueStatus> = {
  address: compareAddress,
  name: compareNames,
  amount: compareAmount,
  area: compareArea,
  use: compareUse,
  floor: compareFloor,
  date: compareDate,
};

/** 두 값(둘 다 있음)의 비교 결과 */
export function compareValues(type: CompareType, a: string, b: string): ValueStatus {
  const status = BY_TYPE[type](a, b);
  // R10 이중 장치 — 주소 계열이 different를 내는 경로는 없어야 한다
  if (type === 'address' && status === 'different') return 'needs_review';
  return status;
}

/* ── 쌍 하나 ───────────────────────────────────────────────── */

export type CompareContext = {
  /** 매물 거래 유형. 전세·매매에는 월세 칸이 원래 없다 */
  dealType?: DealType | null;
};

/** 문서 종류에 원래 없는 칸인가 (V2-PLAN §4-1 공통 스키마 표의 —) */
function kindHasKey(kind: DocumentKind, key: DocumentFieldKey): boolean {
  return FIELD_SPECS.some((s) => s.key === key && s.kinds.includes(kind));
}

/** 거래 유형 때문에 원래 없는 칸인가 */
function notApplicableByDeal(fieldKey: DocumentFieldKey, ctx: CompareContext): boolean {
  return fieldKey === 'rent' && (ctx.dealType === '전세' || ctx.dealType === '매매');
}

export type PairInput = {
  pair: ComparePair;
  valueA: string | null;
  valueB: string | null;
};

export function comparePair({ pair, valueA, valueB }: PairInput, ctx: CompareContext = {}): DiscrepancyStatus {
  if (!kindHasKey(pair.a.kind, pair.a.key) || !kindHasKey(pair.b.kind, pair.b.key)) {
    return 'missing_not_applicable';
  }
  const a = valueA?.trim() ? valueA : null;
  const b = valueB?.trim() ? valueB : null;
  if (a === null && b === null) {
    return notApplicableByDeal(pair.fieldKey, ctx) ? 'missing_not_applicable' : 'missing_not_found';
  }
  if (a === null || b === null) return 'missing_not_found';
  return compareValues(pair.type, a, b);
}

/* ── 문서 전체 ─────────────────────────────────────────────── */

export type CompareDocument = {
  kind: DocumentKind;
  /** 저장된 필드. 없는 키는 null과 같다 */
  fields: Partial<Record<string, string | null>>;
};

export type CompareRow = {
  fieldKey: DocumentFieldKey;
  docA: DocumentKind;
  docB: DocumentKind;
  valueA: string | null;
  valueB: string | null;
  status: DiscrepancyStatus;
};

/**
 * 저장된 문서들 → 대조 결과 행. 두 문서가 모두 있는 쌍만 만든다 (없는 문서는 "찾지 못함"이 아니다).
 * 같은 kind가 둘 이상 오면 앞의 것을 쓴다(저장 액션이 kind별 1건을 보장한다).
 */
export function compareDocuments(docs: readonly CompareDocument[], ctx: CompareContext = {}): CompareRow[] {
  const byKind = new Map<DocumentKind, CompareDocument>();
  for (const d of docs) if (!byKind.has(d.kind)) byKind.set(d.kind, d);

  const rows: CompareRow[] = [];
  for (const pair of COMPARE_PAIRS) {
    const da = byKind.get(pair.a.kind);
    const db = byKind.get(pair.b.kind);
    if (!da || !db) continue;
    const valueA = da.fields[pair.a.key] ?? null;
    const valueB = db.fields[pair.b.key] ?? null;
    rows.push({
      fieldKey: pair.fieldKey,
      docA: pair.a.kind,
      docB: pair.b.kind,
      valueA,
      valueB,
      status: comparePair({ pair, valueA, valueB }, ctx),
    });
  }
  return rows;
}
