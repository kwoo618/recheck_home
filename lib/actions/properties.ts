'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  properties,
  visitChecks,
  questions,
  type DealType,
  type Heating,
  type PropertyStatus,
  type Property,
  type VisitCheck,
  type Question,
} from '@/db/schema';

import { getSessionUserId } from '@/lib/session';
import { geocodeAddress } from '@/lib/geocode';
import { selectVisitRules, canTransition, type RuleContext } from '@/lib/rules';
import { distanceFromSchool, calcProgress } from '@/lib/geo';
import type { PropertyDTO, VisitCheckDTO, QuestionDTO, ActionResult } from '@/lib/types';

/**
 * 매물 Server Actions (PRD v2.1 §8.4)
 *
 * 원칙:
 *   · 판정 가능한 것은 전부 여기가 아니라 lib/rules·lib/geo의 순수 함수가 정한다.
 *     이 파일은 "언제 부를지"와 "DB에 어떻게 반영할지"만 담당한다. (R2)
 *   · 모든 액션은 세션 소유권을 먼저 검증한다. 남의 세션 매물은 없는 것으로 취급한다.
 *   · 쓰기 액션은 예외를 던지지 않고 ActionResult를 돌려준다.
 *     비전공 프론트가 try/catch 없이 ok 분기만으로 처리할 수 있게 하기 위함.
 *   · 읽기 함수는 데이터를 그대로 반환한다(서버 컴포넌트에서 바로 쓰기 위함).
 *
 * ⚠ Neon HTTP 드라이버는 트랜잭션을 지원하지 않는다. 여러 쓰기가 필요한 지점은
 *   순서를 "본체 먼저, 파생 나중"으로 두고, 파생 생성이 실패해도 다음 수정 시
 *   syncVisitChecks()가 복구하도록 설계했다.
 */

const DEAL_TYPES: DealType[] = ['전세', '월세', '매매', '사글세'];
const HEATINGS: Heating[] = ['개별난방', '중앙난방', '지역난방', '모름'];

/* ══════════════════════════════════════════════════════════════
   입력 정규화 — 폼에서 문자열로 넘어오는 값을 안전하게 좁힌다
   ══════════════════════════════════════════════════════════════ */

/**
 * DB 컬럼 타입이 허용하는 상한.
 *
 * 넘는 값을 그대로 INSERT 하면 Postgres가 예외를 던지고, 그러면 이 액션이
 * ActionResult 대신 예외를 밖으로 내보내 프론트가 에러 바운더리를 만난다.
 * "실패해도 {ok:false}"라는 계약을 지키려면 DB에 닿기 전에 걸러야 한다.
 *
 * 자릿수를 하나 더 치는 실수는 흔하다 — 보증금 칸에서 0을 길게 누르면 바로 재현된다.
 */
const INT4_MAX = 2_147_483_647;        // integer 컬럼: price / deposit / mgmt_fee / age
const AREA_MAX = 9999.99;              // numeric(6,2) 컬럼: area
const NAME_MAX_LENGTH = 60;            // text 컬럼이라 DB 제한은 없지만 화면이 감당 못 한다
const FLOOR_MAX_LENGTH = 6;            // "-1" ~ "123" 수준. 층수에 그 이상은 의미가 없다

function toInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

function toFloat(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/**
 * 사글세 선납 값 전용 정규화 — **없으면 0이 아니라 null이다.**
 *
 * toInt는 못 읽은 값을 0으로 떨어뜨리는데, 여기서는 그러면 안 된다.
 * 0은 "선납 없음"이고 null은 "아직 입력하지 않음"이다. 없는 값을 0으로 접으면
 * 화면이 "월 0만원"이라는, 사용자가 넣지 않은 숫자를 만들어낸다 (R8).
 * calcPrepaid도 그래서 값이 없으면 계산하지 않고 {ok:false}를 돌려준다.
 */
function toNullableInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

/**
 * 정규화가 끝난 값이 DB 상한을 넘는지 확인한다.
 * 넘으면 사용자가 무엇을 고쳐야 하는지 알 수 있게 필드 이름을 넣어 돌려준다.
 *
 * ★ 음수는 여기서 걸러지지 않는다 — toInt/toFloat가 이미 0으로 보정한다.
 *   "-5를 입력했더니 저장이 안 된다"보다 "0으로 들어갔다"가 덜 막힌다.
 */
function checkLimits(v: {
  name?: string;
  price?: number;
  deposit?: number;
  mgmtFee?: number;
  age?: number;
  area?: number;
  floor?: string;
  /** 사글세 전용. null은 "입력 안 함"이라 검사 대상이 아니다 */
  prepaidMonths?: number | null;
  prepaidTotal?: number | null;
}): string | null {
  const overInt: [string, number | undefined | null][] = [
    ['보증금', v.deposit],
    ['가격(월세·전세금)', v.price],
    ['관리비', v.mgmtFee],
    ['연식', v.age],
    // 새 숫자 필드를 추가하면 반드시 여기에 넣는다. 빠뜨리면 Postgres 예외가
    // ActionResult 계약을 깨고 프론트가 흰 화면(에러 바운더리)을 만난다.
    ['선납 개월 수', v.prepaidMonths],
    ['선납 총액', v.prepaidTotal],
  ];

  for (const [label, value] of overInt) {
    // null(입력 안 함)과 undefined(이번 수정에 안 넘어옴)는 둘 다 검사 대상이 아니다
    if (value != null && value > INT4_MAX) {
      return `${label} 입력값이 너무 큽니다. 다시 확인해주세요.`;
    }
  }

  if (v.area !== undefined && v.area > AREA_MAX) {
    return `면적 입력값이 너무 큽니다. ${AREA_MAX}㎡ 이하로 입력해주세요.`;
  }

  if (v.name !== undefined && v.name.length > NAME_MAX_LENGTH) {
    return `매물 별칭은 ${NAME_MAX_LENGTH}자 이내로 입력해주세요.`;
  }

  if (v.floor !== undefined && v.floor.length > FLOOR_MAX_LENGTH) {
    return '층수 입력값이 너무 깁니다. 숫자만 입력해주세요.';
  }

  return null;
}

function toCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toText(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

/* ══════════════════════════════════════════════════════════════
   DB row → API 계약 DTO
   ══════════════════════════════════════════════════════════════ */

type PropertyRow = Property & {
  visitChecks: VisitCheck[];
  questions: Question[];
};

function toVisitCheckDTO(v: VisitCheck): VisitCheckDTO {
  return {
    id: v.id,
    propertyId: v.propertyId,
    ruleId: v.ruleId,
    category: v.category,
    title: v.title,
    description: v.description,
    result: v.result,
    memo: v.memo,
    sort: v.sort,
  };
}

function toQuestionDTO(q: Question): QuestionDTO {
  return {
    id: q.id,
    propertyId: q.propertyId,
    text: q.text,
    source: q.source,
    answer: q.answer,
    noAnswer: q.noAnswer,
    sort: q.sort,
  };
}

function toPropertyDTO(row: PropertyRow): PropertyDTO {
  const checks = row.visitChecks ?? [];
  const qs = row.questions ?? [];

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    addressDetail: row.addressDetail,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceFromSchool: row.distanceFromSchool,
    dealType: row.dealType,
    price: row.price,
    deposit: row.deposit,
    mgmtFee: row.mgmtFee,
    // 사글세 전용. null을 0으로 접지 않는다 — 0("선납 없음")과 null("모름")은 다르다
    prepaidMonths: row.prepaidMonths,
    prepaidTotal: row.prepaidTotal,
    // numeric 컬럼은 드라이버에서 string으로 온다 → number로 정규화
    area: Number(row.area),
    age: row.age,
    heating: row.heating,
    floor: row.floor,
    link: row.link,
    status: row.status,
    noConcern: row.noConcern,
    // 진행률은 DB 컬럼이 아니라 규칙 기반 집계값 (점수화 아님)
    progress: calcProgress(checks, qs),
    visitChecks: checks.map(toVisitCheckDTO),
    questions: qs.map(toQuestionDTO),
    safetyChecks: row.safetyChecks,
    contractChecks: row.contractChecks,
    afterChecks: row.afterChecks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 규칙 함수에 넘길 컨텍스트 — 조사지·안전점검 항목 선정의 유일한 입력 */
function ruleContextOf(p: {
  dealType: DealType;
  age: number;
  heating: Heating;
  floor: string;
  deposit: number;
}): RuleContext {
  return {
    dealType: p.dealType,
    age: p.age,
    heating: p.heating,
    floor: p.floor,
    deposit: p.deposit,
  };
}

/* ══════════════════════════════════════════════════════════════
   조회
   ══════════════════════════════════════════════════════════════ */

/**
 * 내 매물 전체 조회 (진행률 계산 포함).
 * 홈 화면(지도·리스트 하이브리드)이 이 하나로 렌더 가능해야 한다.
 */
export async function listProperties(): Promise<PropertyDTO[]> {
  const userId = await getSessionUserId();

  const rows = await db.query.properties.findMany({
    where: eq(properties.userId, userId),
    with: {
      visitChecks: { orderBy: [asc(visitChecks.sort)] },
      questions: { orderBy: [asc(questions.sort)] },
    },
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

  return rows.map(toPropertyDTO);
}

/** 단건 조회. 내 세션 소유가 아니면 null (존재 여부 자체를 노출하지 않는다) */
export async function getProperty(id: string): Promise<PropertyDTO | null> {
  const userId = await getSessionUserId();

  const row = await db.query.properties.findFirst({
    where: and(eq(properties.id, id), eq(properties.userId, userId)),
    with: {
      visitChecks: { orderBy: [asc(visitChecks.sort)] },
      questions: { orderBy: [asc(questions.sort)] },
    },
  });

  return row ? toPropertyDTO(row) : null;
}

/** 비교 대상 = 활성 매물 (status ∉ {confirmed, excluded}) */
export async function listActiveProperties(): Promise<PropertyDTO[]> {
  const all = await listProperties();
  return all.filter((p) => p.status !== 'confirmed' && p.status !== 'excluded');
}

/* ══════════════════════════════════════════════════════════════
   생성
   ══════════════════════════════════════════════════════════════ */

export type CreatePropertyInput = {
  name: string;
  address?: string;
  /** ★ R7: 저장만 하고 지도·PDF에는 노출하지 않는다 */
  addressDetail?: string;
  /** 클라이언트가 주소 검색 단계에서 이미 좌표를 받았다면 그대로 전달 (중복 조회 방지) */
  latitude?: number | string | null;
  longitude?: number | string | null;
  dealType: DealType;
  price?: number | string;
  deposit?: number | string;
  mgmtFee?: number | string;
  /**
   * 사글세 전용. dealType이 '사글세'가 아니면 넘겨도 무시하고 null로 저장한다 —
   * 거래유형을 바꿨을 때 이전 유형의 값이 남아 있으면 계산이 조용히 틀어진다.
   * 빈 문자열·undefined는 0이 아니라 null이 된다 ("모름").
   */
  prepaidMonths?: number | string | null;
  prepaidTotal?: number | string | null;
  area?: number | string;
  age?: number | string;
  heating?: Heating;
  floor?: string;
  link?: string;
};

/**
 * 매물 등록.
 *   좌표 확보 → 거리 계산(lib/geo) → 조사지 항목 자동 생성(lib/rules) → status='prep'
 *
 * ★ R4: 좌표 획득 실패는 등록 실패가 아니다. 좌표 null로 저장하고 계속 진행한다.
 * ★ R5: 여기서 만드는 것은 "확인할 목록"뿐이다. result는 전부 ''로 남긴다.
 */
export async function createProperty(
  input: CreatePropertyInput,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();

  const name = toText(input.name);
  if (!name) return { ok: false, error: '매물 별칭을 입력해주세요.' };

  if (!DEAL_TYPES.includes(input.dealType)) {
    return { ok: false, error: '거래유형을 선택해주세요. (전세 / 월세 / 매매 / 사글세)' };
  }

  const heating: Heating = HEATINGS.includes(input.heating as Heating)
    ? (input.heating as Heating)
    : '모름';

  const address = toText(input.address);

  // 좌표: 클라이언트가 준 값 우선, 없으면 서버에서 조회, 그것도 실패하면 null.
  let latitude = toCoord(input.latitude);
  let longitude = toCoord(input.longitude);

  if ((latitude === null || longitude === null) && address) {
    const coords = await geocodeAddress(address);
    latitude = coords?.latitude ?? null;
    longitude = coords?.longitude ?? null;
  }

  const values = {
    userId,
    name,
    address,
    addressDetail: toText(input.addressDetail),
    latitude,
    longitude,
    distanceFromSchool: distanceFromSchool(latitude, longitude),
    dealType: input.dealType,
    price: toInt(input.price),
    deposit: toInt(input.deposit),
    mgmtFee: toInt(input.mgmtFee),
    // 사글세가 아니면 값이 와도 버린다 — 유형과 맞지 않는 선납값이 남으면 계산이 틀어진다
    prepaidMonths: input.dealType === '사글세' ? toNullableInt(input.prepaidMonths) : null,
    prepaidTotal: input.dealType === '사글세' ? toNullableInt(input.prepaidTotal) : null,
    area: String(toFloat(input.area)), // numeric 컬럼은 string으로 넣는다
    age: toInt(input.age),
    heating,
    floor: toText(input.floor),
    link: toText(input.link),
    status: 'prep' as PropertyStatus, // 등록 직후는 항상 '정보 확인 필요'
  };

  // DB 상한을 넘는 값은 여기서 막는다 — INSERT까지 가면 예외가 되어 계약이 깨진다.
  const limitError = checkLimits({
    name: values.name,
    price: values.price,
    deposit: values.deposit,
    mgmtFee: values.mgmtFee,
    age: values.age,
    area: Number(values.area),
    floor: values.floor,
    prepaidMonths: values.prepaidMonths,
    prepaidTotal: values.prepaidTotal,
  });
  if (limitError) return { ok: false, error: limitError };

  const [created] = await db.insert(properties).values(values).returning({ id: properties.id });

  // 조사지 ① 직접 확인할 것 — 규칙으로만 선정 (AI 개입 없음)
  await syncVisitChecks(
    created.id,
    ruleContextOf({
      dealType: values.dealType,
      age: values.age,
      heating: values.heating,
      floor: values.floor,
      deposit: values.deposit,
    }),
  );

  revalidatePath('/');

  return { ok: true, data: { id: created.id } };
}

/* ══════════════════════════════════════════════════════════════
   수정
   ══════════════════════════════════════════════════════════════ */

export type UpdatePropertyInput = Partial<CreatePropertyInput> & {
  noConcern?: boolean;
};

/**
 * 정보 확인·수정 (PRD §5.2 — 사람의 2차 확인).
 *
 * 조건(연식·난방·층수·거래유형·보증금)이 바뀌면 조사지 항목을 재생성한다.
 * 주소가 바뀌면 좌표·거리를 다시 계산한다.
 */
export async function updateProperty(
  id: string,
  input: UpdatePropertyInput,
): Promise<ActionResult<void>> {
  const userId = await getSessionUserId();

  const [current] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .limit(1);

  if (!current) return { ok: false, error: '매물을 찾을 수 없습니다.' };

  const patch: Partial<typeof properties.$inferInsert> = {};

  if (input.name !== undefined) {
    const name = toText(input.name);
    if (!name) return { ok: false, error: '매물 별칭을 입력해주세요.' };
    patch.name = name;
  }

  if (input.dealType !== undefined) {
    if (!DEAL_TYPES.includes(input.dealType)) {
      return { ok: false, error: '거래유형을 선택해주세요. (전세 / 월세 / 매매 / 사글세)' };
    }
    patch.dealType = input.dealType;
  }

  if (input.heating !== undefined) {
    patch.heating = HEATINGS.includes(input.heating) ? input.heating : '모름';
  }

  if (input.addressDetail !== undefined) patch.addressDetail = toText(input.addressDetail);
  if (input.price !== undefined) patch.price = toInt(input.price);
  if (input.deposit !== undefined) patch.deposit = toInt(input.deposit);
  if (input.mgmtFee !== undefined) patch.mgmtFee = toInt(input.mgmtFee);

  /*
   * ── 사글세 선납값 ──
   * 수정 후의 거래유형(넘어왔으면 그것, 아니면 기존값)을 기준으로 판단한다.
   * 사글세가 아니게 되면 남아 있던 선납값을 지운다 — 유형과 맞지 않는 값이 남으면
   * 나중에 다시 사글세로 되돌렸을 때 옛 값이 되살아나 사용자가 넣지 않은 숫자가 계산에 들어간다.
   */
  const nextDealType = patch.dealType ?? current.dealType;

  if (nextDealType !== '사글세') {
    if (current.prepaidMonths !== null) patch.prepaidMonths = null;
    if (current.prepaidTotal !== null) patch.prepaidTotal = null;
  } else {
    if (input.prepaidMonths !== undefined) patch.prepaidMonths = toNullableInt(input.prepaidMonths);
    if (input.prepaidTotal !== undefined) patch.prepaidTotal = toNullableInt(input.prepaidTotal);
  }
  if (input.area !== undefined) patch.area = String(toFloat(input.area));
  if (input.age !== undefined) patch.age = toInt(input.age);
  if (input.floor !== undefined) patch.floor = toText(input.floor);
  if (input.link !== undefined) patch.link = toText(input.link);
  if (input.noConcern !== undefined) patch.noConcern = Boolean(input.noConcern);

  // ── 위치 재계산 ──
  const explicitLat = toCoord(input.latitude);
  const explicitLng = toCoord(input.longitude);
  const addressChanged =
    input.address !== undefined && toText(input.address) !== current.address;

  if (input.address !== undefined) patch.address = toText(input.address);

  if (explicitLat !== null && explicitLng !== null) {
    patch.latitude = explicitLat;
    patch.longitude = explicitLng;
    patch.distanceFromSchool = distanceFromSchool(explicitLat, explicitLng);
  } else if (addressChanged) {
    const nextAddress = toText(input.address);
    // R4: 재조회 실패 시 좌표를 null로 되돌린다. 옛 주소의 좌표를 남기면 잘못된 핀이 찍힌다.
    const coords = nextAddress ? await geocodeAddress(nextAddress) : null;
    patch.latitude = coords?.latitude ?? null;
    patch.longitude = coords?.longitude ?? null;
    patch.distanceFromSchool = distanceFromSchool(
      patch.latitude ?? null,
      patch.longitude ?? null,
    );
  }

  // 생성과 같은 이유로 UPDATE 전에도 상한을 확인한다.
  // 넘어온 필드만 검사한다 — 이미 저장된 값은 통과했던 값이다.
  const limitError = checkLimits({
    name: patch.name,
    price: patch.price,
    deposit: patch.deposit,
    mgmtFee: patch.mgmtFee,
    age: patch.age,
    area: patch.area === undefined ? undefined : Number(patch.area),
    floor: patch.floor,
    prepaidMonths: patch.prepaidMonths,
    prepaidTotal: patch.prepaidTotal,
  });
  if (limitError) return { ok: false, error: limitError };

  patch.updatedAt = new Date();

  await db.update(properties).set(patch).where(eq(properties.id, id));

  // ── 조사지 재생성 판단 ──
  const merged = { ...current, ...patch };
  const contextChanged =
    merged.dealType !== current.dealType ||
    merged.age !== current.age ||
    merged.heating !== current.heating ||
    merged.floor !== current.floor ||
    merged.deposit !== current.deposit;

  if (contextChanged) {
    await syncVisitChecks(
      id,
      ruleContextOf({
        dealType: merged.dealType,
        age: merged.age,
        heating: merged.heating,
        floor: merged.floor,
        deposit: merged.deposit,
      }),
    );
  }

  revalidatePath('/');
  revalidatePath(`/property/${id}`);

  return { ok: true, data: undefined };
}

/**
 * 조사지 ① 항목을 규칙 선정 결과에 맞춘다.
 *
 * 보존 규칙 — 사용자의 기록은 규칙보다 우선한다:
 *   · ruleId='custom' (직접 추가한 항목)은 절대 지우지 않는다
 *   · 이미 결과(result)나 메모가 입력된 항목은 규칙에서 빠져도 남긴다 (R5: 기록은 사용자의 것)
 *   · 그 외 "빈 규칙 항목"만 정리하고, 새로 해당된 규칙을 추가한다
 */
async function syncVisitChecks(propertyId: string, ctx: RuleContext): Promise<void> {
  const existing = await db
    .select()
    .from(visitChecks)
    .where(eq(visitChecks.propertyId, propertyId));

  const desired = selectVisitRules(ctx);
  const desiredIds = new Set(desired.map((r) => r.id));
  const existingRuleIds = new Set(
    existing.filter((e) => e.ruleId !== 'custom').map((e) => e.ruleId),
  );

  const removable = existing.filter(
    (e) =>
      e.ruleId !== 'custom' &&
      !desiredIds.has(e.ruleId) &&
      e.result === '' &&
      e.memo === '',
  );

  if (removable.length > 0) {
    await db.delete(visitChecks).where(
      inArray(
        visitChecks.id,
        removable.map((e) => e.id),
      ),
    );
  }

  const additions = desired
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => !existingRuleIds.has(rule.id))
    .map(({ rule, index }) => ({
      propertyId,
      ruleId: rule.id,
      category: rule.category,
      title: rule.title,
      description: rule.description,
      // ★ R5: 방문 전이므로 결과는 비워 둔다. 체크는 국면 B에서만.
      result: '' as const,
      memo: '',
      sort: index,
    }));

  if (additions.length > 0) {
    await db.insert(visitChecks).values(additions);
  }
}

/* ══════════════════════════════════════════════════════════════
   상태 전이 · 삭제
   ══════════════════════════════════════════════════════════════ */

/**
 * 상태 전이 (PRD §3 — 서버 강제).
 * 허용 여부는 lib/rules.canTransition()이 단독으로 판단한다.
 */
export async function setStatus(
  id: string,
  next: PropertyStatus,
): Promise<ActionResult<void>> {
  const userId = await getSessionUserId();

  const [current] = await db
    .select({ status: properties.status })
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .limit(1);

  if (!current) return { ok: false, error: '매물을 찾을 수 없습니다.' };

  if (current.status === next) {
    return { ok: true, data: undefined }; // 멱등 처리
  }

  if (!canTransition(current.status, next)) {
    return {
      ok: false,
      error: `허용되지 않은 상태 전이입니다: ${current.status} → ${next}`,
    };
  }

  await db
    .update(properties)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(properties.id, id));

  revalidatePath('/');
  revalidatePath(`/property/${id}`);

  return { ok: true, data: undefined };
}

/** 매물 삭제. visit_checks·questions는 FK ON DELETE CASCADE로 함께 지워진다. */
export async function deleteProperty(id: string): Promise<ActionResult<void>> {
  const userId = await getSessionUserId();

  const deleted = await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .returning({ id: properties.id });

  if (deleted.length === 0) return { ok: false, error: '매물을 찾을 수 없습니다.' };

  revalidatePath('/');

  return { ok: true, data: undefined };
}
