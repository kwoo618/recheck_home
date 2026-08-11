import {
  pgTable, uuid, text, integer, numeric, boolean, jsonb,
  timestamp, doublePrecision, index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * 리:체크 DB 스키마 (PRD v2.1 §8.3)
 *
 * 설계 원칙:
 * - 규칙 상수(VISIT_RULES / QBANK / SAFETY_RULES 등)는 DB가 아니라 lib/rules.ts 코드에 둔다.
 *   결정론 로직은 버전 관리·유닛 테스트 대상이어야 하므로.
 * - latitude/longitude는 nullable. 좌표 획득 실패가 등록을 막지 않는다.
 * - safety/contract/after 체크는 규칙 id 참조라 JSONB로 충분.
 *   visit_checks/questions는 사용자 편집(추가·삭제·정렬)이 있어 테이블로 분리.
 */

/* ── users: 익명 세션(UUID 쿠키) 기준 ────────────────────────── */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 금융 프로필: { cash, loanCap, rate, cvRate } — 사용자당 1개 */
  finance: jsonb('finance').$type<FinanceProfile>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ── properties ──────────────────────────────────────────────── */
export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),

    // ── 위치 (v2.1 신규) ──
    address: text('address').default('').notNull(),
    /** 동/호수 — 지도·PDF·공유 화면에 노출 금지 (개인정보·매물 특정 방지) */
    addressDetail: text('address_detail').default('').notNull(),
    latitude: doublePrecision('latitude'),   // nullable
    longitude: doublePrecision('longitude'), // nullable
    /** 대구대학교 기준 직선거리(m). 등록 시 계산해 캐시 (기준점은 lib/geo.ts SCHOOL_ORIGIN) */
    distanceFromSchool: integer('distance_from_school'),

    // ── 매물 정보 ──
    dealType: text('deal_type').$type<DealType>().notNull(),
    price: integer('price').default(0).notNull(),      // 만원 (월세면 월세액)
    deposit: integer('deposit').default(0).notNull(),  // 만원 (월세 보증금)
    mgmtFee: integer('mgmt_fee').default(0).notNull(), // 만원
    area: numeric('area', { precision: 6, scale: 2 }).default('0').notNull(), // ㎡
    age: integer('age').default(0).notNull(),          // 년차
    heating: text('heating').$type<Heating>().default('모름').notNull(),
    floor: text('floor').default('').notNull(),
    link: text('link').default('').notNull(),

    // ── 상태 ──
    status: text('status').$type<PropertyStatus>().default('prep').notNull(),
    noConcern: boolean('no_concern').default(false).notNull(),

    // ── 규칙 체크(규칙 id → bool) ──
    safetyChecks: jsonb('safety_checks').$type<CheckMap>().default({}).notNull(),
    contractChecks: jsonb('contract_checks').$type<CheckMap>().default({}).notNull(),
    afterChecks: jsonb('after_checks').$type<CheckMap>().default({}).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('properties_user_idx').on(t.userId),
    statusIdx: index('properties_status_idx').on(t.userId, t.status),
  }),
);

/* ── visit_checks: 조사지의 '직접 확인할 것' + 방문 후 결과 ──── */
export const visitChecks = pgTable(
  'visit_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id').notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** 규칙 출처 id. 사용자가 직접 추가한 항목은 'custom' */
    ruleId: text('rule_id').default('custom').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    /** '' | good | ok | bad | na — 방문 전에는 항상 '' */
    result: text('result').$type<VisitResult>().default('').notNull(),
    memo: text('memo').default('').notNull(),
    sort: integer('sort').default(0).notNull(),
  },
  (t) => ({ propIdx: index('visit_checks_prop_idx').on(t.propertyId) }),
);

/* ── questions: 중개사에게 물어볼 것 + 받은 답변 ─────────────── */
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id').notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** bank = 질문 은행(규칙) | ai = AI 변환 */
    source: text('source').$type<QuestionSource>().notNull(),
    answer: text('answer').default('').notNull(),
    /** 현장에서 답을 듣지 못한 경우 */
    noAnswer: boolean('no_answer').default(false).notNull(),
    sort: integer('sort').default(0).notNull(),
  },
  (t) => ({ propIdx: index('questions_prop_idx').on(t.propertyId) }),
);

/* ── ai_logs: 발표용 AI 입출력 대조 자료 ─────────────────────── */
export const aiLogs = pgTable('ai_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  feature: text('feature').$type<AiFeature>().notNull(),
  inputSummary: text('input_summary').default('').notNull(),
  outputText: text('output_text').default('').notNull(),
  /** 금칙어 필터에 걸려 폴백 처리됐는지 */
  filtered: boolean('filtered').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/* ── relations ───────────────────────────────────────────────── */
export const usersRelations = relations(users, ({ many }) => ({
  properties: many(properties),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  user: one(users, { fields: [properties.userId], references: [users.id] }),
  visitChecks: many(visitChecks),
  questions: many(questions),
}));

export const visitChecksRelations = relations(visitChecks, ({ one }) => ({
  property: one(properties, { fields: [visitChecks.propertyId], references: [properties.id] }),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  property: one(properties, { fields: [questions.propertyId], references: [properties.id] }),
}));

/* ── 타입 ────────────────────────────────────────────────────── */
export type DealType = '전세' | '월세' | '매매';
export type Heating = '개별난방' | '중앙난방' | '지역난방' | '모름';
export type PropertyStatus = 'prep' | 'ready' | 'recorded' | 'confirmed' | 'excluded';
export type VisitResult = '' | 'good' | 'ok' | 'bad' | 'na';
export type QuestionSource = 'bank' | 'ai';
export type AiFeature = 'parse' | 'questions' | 'summary';
export type CheckMap = Record<string, boolean>;
export type FinanceProfile = {
  cash?: number;    // 보유 현금 (만원)
  loanCap?: number; // 대출 가능 금액 (만원)
  rate?: number;    // 예상 대출 금리 (연 %)
  cvRate?: number;  // 전월세전환율 (연 %, 참고 기준)
};

export type User = typeof users.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type VisitCheck = typeof visitChecks.$inferSelect;
export type Question = typeof questions.$inferSelect;
