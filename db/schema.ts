import {
  pgTable, uuid, text, integer, numeric, boolean, jsonb,
  timestamp, doublePrecision, index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { TouchpointId } from '../lib/ai/touchpoints';

/**
 * Sealook Homes(씰룩홈즈) DB 스키마 (PRD v2.1 §8.3)
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

    /*
     * ── 사글세 (2026-08-12 추가) ──────────────────────────────
     * 대구대 인근 자취방 상당수가 사글세다. 이 두 칸이 없으면 해당 매물은 등록 자체가 안 된다.
     *
     * ★ nullable이다. 사글세가 아닌 매물은 null이고, 사글세여도 아직 입력하지 않았으면 null이다.
     *   0과 null을 구분해야 한다 — 0은 "선납 없음"이고 null은 "모른다"다.
     *   금액 필드를 0으로 채우면 화면이 "월 0원"처럼 서비스가 정한 숫자를 만들어낸다.
     * ★ deal_type은 PG enum이 아니라 text라 '사글세' 추가에는 마이그레이션이 필요 없다.
     *   실제로 DDL이 필요한 것은 이 두 칸뿐이고, 되돌리기는 DROP COLUMN 하나다.
     */
    /** 선납한 개월 수 (사글세 전용) */
    prepaidMonths: integer('prepaid_months'),
    /** 선납 총액, 만원 (사글세 전용) */
    prepaidTotal: integer('prepaid_total'),
    /**
     * 관리비 부과 방식 (v2 추가 — V2-PLAN §6). nullable — null은 "아직 묻지 않음"이다.
     * '모름'은 사용자가 답한 값이고, 조사지 질문 자동 생성의 입력이 된다. 둘을 섞지 않는다.
     */
    mgmtFeeMode: text('mgmt_fee_mode').$type<MgmtFeeMode>(),
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
  /**
   * AI 지점 id (v2 추가 — lib/ai/touchpoints.ts 등록표). nullable — v1 행에는 값이 없다.
   * feature는 v1 호환으로 남긴다. 지점별 집계는 이 칸으로 한다.
   */
  touchpoint: text('touchpoint').$type<TouchpointId>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/*
 * ── v2 문서 대조 (V2-PLAN §4-1 · §7) ─────────────────────────────
 *
 * ★ R9: 문서 원본은 기기(IndexedDB)에만 있다. documents에 원본 참조 컬럼
 *   (파일 경로·URL·blob·해시 등)을 만들지 않는다. 서버에는 추출 필드만 온다.
 * ★ R10: 주소 필드는 discrepancies.status에 'different'를 갖지 않는다 —
 *   표기 체계가 달라 다른 것이다. 'needs_review'(두 표기 나란히)로만 간다.
 *   이 규칙은 스키마가 아니라 lib/compare/*의 순수 함수가 지킨다.
 */

/* ── documents: 매물에 붙은 문서 한 건 (원본 없음) ────────────── */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id').notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<DocumentKind>().notNull(),
    /** 필드를 어디서 얻었나. OCR 보류 중에는 'pdf_text'와 'manual'만 쓴다 */
    ocrSource: text('ocr_source').$type<OcrSource>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ propIdx: index('documents_prop_idx').on(t.propertyId) }),
);

/* ── document_fields: 문서에서 추출·입력한 공통 스키마 필드 ────── */
export const documentFields = pgTable(
  'document_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    /** V2-PLAN §4-1 공통 스키마 키 (address_road · owner_name · deposit …) */
    fieldKey: text('field_key').notNull(),
    /** ★ R8: 못 찾으면 null. 모델 추정값·빈 문자열로 채우지 않는다 */
    value: text('value'),
    /** 페이지 내 위치. 없으면 null → 화면은 "위치 추정" */
    bbox: jsonb('bbox').$type<FieldBbox>(),
    confidence: doublePrecision('confidence'),
    editedByUser: boolean('edited_by_user').default(false).notNull(),
  },
  (t) => ({ docIdx: index('document_fields_doc_idx').on(t.documentId) }),
);

/* ── discrepancies: 문서 간 대조 결과 (재실행 시 property_id 기준 전량 교체) ── */
export const discrepancies = pgTable(
  'discrepancies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id').notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    fieldKey: text('field_key').notNull(),
    /** 같은 문서 안 비교(한글 금액 ↔ 숫자 금액)는 doc_a = doc_b */
    docA: text('doc_a').$type<DocumentKind>().notNull(),
    docB: text('doc_b').$type<DocumentKind>().notNull(),
    valueA: text('value_a'),
    valueB: text('value_b'),
    status: text('status').$type<DiscrepancyStatus>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ propIdx: index('discrepancies_prop_idx').on(t.propertyId) }),
);

/* ── relations ───────────────────────────────────────────────── */
export const usersRelations = relations(users, ({ many }) => ({
  properties: many(properties),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  user: one(users, { fields: [properties.userId], references: [users.id] }),
  visitChecks: many(visitChecks),
  questions: many(questions),
  documents: many(documents),
  discrepancies: many(discrepancies),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  property: one(properties, { fields: [documents.propertyId], references: [properties.id] }),
  fields: many(documentFields),
}));

export const documentFieldsRelations = relations(documentFields, ({ one }) => ({
  document: one(documents, { fields: [documentFields.documentId], references: [documents.id] }),
}));

export const discrepanciesRelations = relations(discrepancies, ({ one }) => ({
  property: one(properties, { fields: [discrepancies.propertyId], references: [properties.id] }),
}));

export const visitChecksRelations = relations(visitChecks, ({ one }) => ({
  property: one(properties, { fields: [visitChecks.propertyId], references: [properties.id] }),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  property: one(properties, { fields: [questions.propertyId], references: [properties.id] }),
}));

/* ── 타입 ────────────────────────────────────────────────────── */
/**
 * ★ 한글 표기를 그대로 값으로 쓴다. 영문 키로 바꾸지 않는다 —
 *   DB에 이미 '전세'·'월세'·'매매'가 저장돼 있고, 배포본을 팀원들이 쓰는 중이라
 *   키를 갈아끼우면 기존 행 전부를 옮기는 데이터 마이그레이션이 된다.
 * ★ '사글세' 추가(2026-08-12): deal_type은 text 컬럼이라 DDL 변경이 필요 없다.
 */
export type DealType = '전세' | '월세' | '매매' | '사글세';
export type Heating = '개별난방' | '중앙난방' | '지역난방' | '모름';
export type PropertyStatus = 'prep' | 'ready' | 'recorded' | 'confirmed' | 'excluded';
export type VisitResult = '' | 'good' | 'ok' | 'bad' | 'na';
export type QuestionSource = 'bank' | 'ai';
/** v1 호환 분류. 지점별 구분은 ai_logs.touchpoint(TouchpointId)가 맡는다 */
export type AiFeature = 'parse' | 'questions' | 'summary' | 'document' | 'helper';
/** 관리비 부과 방식 (V2-PLAN §6). deal_type과 같은 이유로 한글 표기를 값으로 쓴다 */
export type MgmtFeeMode = '포함' | '매월 별도' | '모름';
/** 대조 문서 3종 (V2-PLAN §1) */
export type DocumentKind = 'ad' | 'registry' | 'contract';
/**
 * 필드 출처. V2-PLAN §7의 device·server는 OCR 보류(2026-09-29) 중 쓰지 않는다.
 * manual은 텍스트 레이어가 없어 확인 화면에서 직접 입력한 경우 (광고 캡처 포함).
 */
export type OcrSource = 'pdf_text' | 'manual' | 'device' | 'server';
/**
 * 대조 결과 (R10).
 * · different는 표기 체계가 같은 필드(성명·금액·면적·용도·층·날짜)에만
 * · needs_review는 주소 표기 차이 전용 — "확인 필요, 두 표기 나란히"
 * · missing은 원래 없는 필드(not_applicable)와 못 찾은 필드(not_found)를 나눈다
 */
export type DiscrepancyStatus =
  | 'same'
  | 'different'
  | 'missing_not_applicable'
  | 'missing_not_found'
  | 'needs_review';
/** pdf.js transform으로 계산한 페이지 좌표 (page는 1부터) */
export type FieldBbox = { page: number; x: number; y: number; w: number; h: number };
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
/** DOM 전역 Document와 겹치지 않게 이름을 달리한다 */
export type PropertyDocument = typeof documents.$inferSelect;
export type DocumentField = typeof documentFields.$inferSelect;
export type Discrepancy = typeof discrepancies.$inferSelect;
