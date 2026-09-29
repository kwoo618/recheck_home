import type { DocumentKind } from '@/db/schema';
import { containsBanned } from '@/lib/rules';
import { fieldSpecsFor, LOG_REDACTED_KEYS, type DocumentFieldKey } from './fields';

/**
 * 지점 ④ 응답 정규화 — 모델 출력을 믿지 않는다 (R1 · R8 · docs/API-V2.md §2)
 *
 * 모델은 { "<field_key>": "<원문 표기>" | null, … } 형태의 JSON을 준다.
 * 여기서 하는 일:
 *   · 그 kind에 허용된 키만 남기고, 빠진 키는 null로 채워 **모든 칸**을 돌려준다 (확인 화면이 전 필드를 그린다)
 *   · 값은 문자열만. 숫자·객체는 모델이 표기를 바꾼 것이므로 버린다(null)
 *   · "없음"·"N/A" 같은 빈 값 표시는 null — 빈 문자열·자리표시로 채우지 않는다
 *   · **원문에 없는 값은 null** — 공백을 뺀 값이 공백을 뺀 원문 안에 그대로 있어야 한다.
 *     모델이 추정해 채운 값(R8)과 판정 문장(R1)이 여기서 걸러진다
 *   · 금칙어가 섞인 값은 null
 *
 * ★ 순수 함수. confidence는 모델에게 묻지 않으므로 항상 null이다 — 0~1을 지어내지 않는다.
 */

export type ExtractedField = {
  fieldKey: DocumentFieldKey;
  value: string | null;
  confidence: number | null;
};

/** 모델이 "못 찾음"을 문자열로 적어 오는 경우 */
const NULL_TOKENS = new Set([
  '', 'null', 'none', 'n/a', 'na', '-', '—', '없음', '해당 없음', '해당없음',
  '미기재', '기재 없음', '알 수 없음', '확인 불가', '불명',
]);

/** 한 칸 값 길이 상한 — 넘으면 원문 옮겨 적기가 아니다. 특약만 길 수 있다 */
const VALUE_MAX_LENGTH = 200;
const SPECIAL_TERMS_MAX_LENGTH = 4000;

/** 쉼표로 여러 항목을 이어 적는 키 — 항목마다 원문 대조한다 */
const LIST_KEYS: readonly DocumentFieldKey[] = ['lien_total', 'seizure_flags'];

const compact = (s: string) => s.replace(/\s+/g, '');

/** 모델 응답에서 필드 맵을 꺼낸다. { fields: {...} } 로 한 겹 감싸 오는 경우도 받는다 */
function pickMap(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const inner = obj.fields;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return obj;
}

function normalizeAgentFlag(v: unknown): string | null {
  if (v === true || v === 'true') return 'true';
  if (v === false || v === 'false') return 'false';
  return null;
}

function normalizeValue(key: DocumentFieldKey, v: unknown, source: string): string | null {
  if (key === 'agent_flag') return normalizeAgentFlag(v);
  if (typeof v !== 'string') return null;

  const multiline = key === 'special_terms';
  const value = multiline ? v.trim() : v.replace(/\s+/g, ' ').trim();

  if (NULL_TOKENS.has(value.toLowerCase())) return null;
  if (value.length > (multiline ? SPECIAL_TERMS_MAX_LENGTH : VALUE_MAX_LENGTH)) return null;
  if (containsBanned(value)) return null;

  // 원문 대조 — 모델이 원문에 없는 값을 만들었으면 버린다 (R8)
  const parts = LIST_KEYS.includes(key) ? value.split(',').map((p) => p.trim()).filter(Boolean) : [value];
  if (parts.length === 0) return null;
  const haystack = compact(source);
  if (!parts.every((p) => haystack.includes(compact(p)))) return null;

  return value;
}

/**
 * @param raw     parseJson 결과 (무엇이든 올 수 있다)
 * @param kind    요청한 문서 종류
 * @param source  모델에 보낸 (마스킹 후) 텍스트 — 원문 대조 기준
 */
export function normalizeDocumentFields(
  raw: unknown,
  kind: DocumentKind,
  source: string,
): ExtractedField[] {
  const map = pickMap(raw);
  return fieldSpecsFor(kind).map((spec) => ({
    fieldKey: spec.key,
    value: Object.hasOwn(map, spec.key) ? normalizeValue(spec.key, map[spec.key], source) : null,
    confidence: null,
  }));
}

/** 하나라도 값이 있는가 — 전부 null이면 라우트는 {ok:false}로 수기 입력에 넘긴다 */
export function hasAnyValue(fields: ExtractedField[]): boolean {
  return fields.some((f) => f.value !== null);
}

/**
 * ai_logs.output_text 용 — 성명·호수·특약 원문 값을 가린다 (docs/API-V2.md §2 "ai_logs").
 * 가린 칸은 값이 있었는지만 남긴다.
 */
export function redactFieldsForLog(fields: ExtractedField[]): string {
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    out[f.fieldKey] =
      f.value !== null && LOG_REDACTED_KEYS.includes(f.fieldKey) ? '[가림]' : f.value;
  }
  return JSON.stringify(out);
}
