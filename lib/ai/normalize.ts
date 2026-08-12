import type { DealType, Heating } from '@/db/schema';
import { containsBanned } from '@/lib/rules';

/**
 * AI 출력 정규화 — 모델 응답을 절대 그대로 믿지 않는다.
 *
 * 모델은 스키마를 어길 수 있고, 없는 값을 지어낼 수 있고, 지시를 무시할 수 있다.
 * 여기서 아는 키·아는 타입만 통과시킨 뒤에야 사용자 화면과 DB로 넘어간다.
 *
 * 순수 함수 — 네트워크·DB 없이 테스트한다.
 */

const DEAL_TYPES: DealType[] = ['전세', '월세', '매매', '사글세'];
const HEATINGS: Heating[] = ['개별난방', '중앙난방', '지역난방', '모름'];

/**
 * 모델 응답에서 JSON을 꺼낸다. 실패는 예외가 아니라 null이다.
 *
 * 모델은 JSON 모드에서도 완벽한 JSON을 주지 않는다. 실제로 관측된 것들:
 *   · ```json 코드 펜스로 감싸기
 *   · 닫는 괄호를 하나 더 붙이기  ← 2026-08-11 gemini-3.5-flash에서 실제 발생
 *   · 앞뒤에 설명 문장 덧붙이기
 *
 * 그래서 그대로 파싱해 보고, 실패하면 첫 여는 괄호부터 짝이 맞는 지점까지만 잘라 다시 시도한다.
 */
/**
 * 괄호 보충 복구가 발동했을 때 `ai_logs.output_text` 앞에 붙이는 표시.
 * 새 컬럼을 만들지 않고 기존 칸에 남긴다 — 마이그레이션 없이 `LIKE '[괄호 보충%'` 로 셀 수 있다.
 */
export const RECOVERY_MARK = '[괄호 보충 복구]';

export type JsonParseResult<T> = {
  value: T | null;
  /** 닫는 괄호를 보충해 살려냈는지 — 얼마나 자주 나는지 알아야 해서 밖으로 내보낸다 */
  recovered: boolean;
};

export function parseJson<T>(text: string): T | null {
  return parseJsonDetailed<T>(text).value;
}

/**
 * 모델 응답에서 JSON을 꺼낸다. 실패는 예외가 아니라 null이다.
 *
 * 3단계로 시도한다. 순서를 바꾸지 말 것 — 뒤 단계일수록 손을 더 대는 복구다.
 *   ① 그대로 파싱
 *   ② 앞뒤 잡소리를 버리고 **짝이 맞는 구간만** 잘라내 파싱  (extractBalanced)
 *      → 모델이 닫는 괄호를 **하나 더** 붙이거나 뒤에 설명을 덧붙이는 경우
 *   ③ **모자란 닫는 괄호를 보충**해 파싱                      (completeBrackets)
 *      → 응답이 잘려 마지막 괄호가 없는 경우
 */
export function parseJsonDetailed<T>(text: string): JsonParseResult<T> {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  if (!cleaned) return { value: null, recovered: false };

  try {
    return { value: JSON.parse(cleaned) as T, recovered: false };
  } catch {
    // 아래에서 잘라내 재시도
  }

  const balanced = extractBalanced(cleaned);
  if (balanced) {
    try {
      return { value: JSON.parse(balanced) as T, recovered: false };
    } catch {
      // ③으로 넘어간다
    }
  }

  const completed = completeBrackets(cleaned);
  if (!completed) return { value: null, recovered: false };

  try {
    return { value: JSON.parse(completed) as T, recovered: true };
  } catch {
    // 보충해도 안 되면 그대로 실패다. 억지로 살리지 않는다.
    return { value: null, recovered: false };
  }
}

/**
 * 잘려서 닫는 괄호가 모자란 JSON에 그 괄호만 보충한다.
 *
 * 실측 사례(2026-08-12): 모델이 10개 필드를 전부 맞게 뽑고도 마지막 `}` 하나를
 * 빠뜨려 응답 전체가 버려졌다. `finishReason`은 `STOP`이라 상위 가드에도 걸리지 않았다.
 * 한 글자 때문에 멀쩡한 값 10개를 버리는 것은 아깝다.
 *
 * ★ **닫는 괄호를 채우는 것만 한다.** 값을 지어내거나 콤마를 손보지 않는다.
 *   보충하고도 파싱이 안 되면 그대로 실패로 둔다.
 * ★ 복구하지 않는 경우:
 *   · 문자열이 끝나지 않은 채 잘림 — 어디서 끊겼는지 알 수 없다
 *   · 여는 괄호 없이 닫는 괄호가 나옴 — 구조가 깨진 것이지 잘린 것이 아니다
 *   · 보충할 괄호가 없음 — 다른 이유로 깨진 것이다
 * ★ 문자열 안의 괄호는 세지 않는다. `{"note":"여기 } 괄호"` 같은 값이 실제로 온다.
 */
function completeBrackets(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      // 짝이 맞지 않는 닫는 괄호 — 잘린 것이 아니라 구조가 깨진 것이다
      if (stack.pop() !== ch) return null;
    }
  }

  if (inString) return null;
  if (stack.length === 0) return null;

  return text.slice(start) + stack.reverse().join('');
}

/** 첫 '{' 또는 '['부터 짝이 맞는 닫는 괄호까지를 잘라낸다. 문자열 리터럴 안의 괄호는 세지 않는다. */
function extractBalanced(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null; // 끝까지 짝이 맞지 않음 — 잘린 응답
}

/** 사용자가 등록 폼에서 확인·수정할 초안. 모든 필드가 선택이다. */
export type ParsedProperty = {
  name?: string;
  address?: string;
  dealType?: DealType;
  price?: number;
  deposit?: number;
  mgmtFee?: number;
  area?: number;
  age?: number;
  heating?: Heating;
  floor?: string;
};

/** 지어낸 값이 들어오는 것보다 비어 있는 편이 낫다 — 범위를 벗어나면 버린다 */
const LIMITS = {
  price: 1_000_000,   // 만원 (= 100억)
  deposit: 1_000_000,
  mgmtFee: 1_000,
  area: 10_000,       // ㎡
  age: 200,           // 년차
} as const;

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, max);
  return s ? s : undefined;
}

function amount(v: unknown, max: number): number | undefined {
  const n = typeof v === 'string' ? Number(v.replace(/[,\s]/g, '')) : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return n;
}

export function normalizeParsed(raw: unknown): ParsedProperty {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const r = raw as Record<string, unknown>;
  const out: ParsedProperty = {};

  const name = text(r.name, 60);
  // 별칭·주소에 판정성 표현이 섞여 오면 그 필드만 버린다 (R1)
  if (name && !containsBanned(name)) out.name = name;

  const address = text(r.address, 200);
  if (address && !containsBanned(address)) out.address = address;

  if (DEAL_TYPES.includes(r.dealType as DealType)) out.dealType = r.dealType as DealType;
  if (HEATINGS.includes(r.heating as Heating)) out.heating = r.heating as Heating;

  const price = amount(r.price, LIMITS.price);
  if (price !== undefined) out.price = Math.round(price);

  const deposit = amount(r.deposit, LIMITS.deposit);
  if (deposit !== undefined) out.deposit = Math.round(deposit);

  const mgmtFee = amount(r.mgmtFee, LIMITS.mgmtFee);
  if (mgmtFee !== undefined) out.mgmtFee = Math.round(mgmtFee);

  const area = amount(r.area, LIMITS.area);
  if (area !== undefined) out.area = area;

  const age = amount(r.age, LIMITS.age);
  if (age !== undefined) out.age = Math.round(age);

  // 층수는 "3", "-1"(지하) 같은 짧은 문자열만 받는다.
  const floor = text(r.floor, 6);
  if (floor && /^-?\d{1,3}$/.test(floor)) out.floor = floor;

  return out;
}

/** 질문 배열 정규화 — 문자열만, 금칙어 제외, 중복 제거, 최대 4개 */
export function normalizeQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') continue;

    const q = item.trim().slice(0, 120);
    if (!q) continue;
    if (containsBanned(q)) continue; // 판정성 질문은 버린다 (R1)
    if (seen.has(q)) continue;

    seen.add(q);
    out.push(q);
    if (out.length === 4) break;
  }

  return out;
}
