// 가상 데이터 — 이 파일의 성명·주소·번호·금액은 전부 지어낸 값이다. 실제 문서에서 옮긴 것이 없다.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { NO_JUDGMENT_RULE, DOCUMENT_REGISTRY_SYSTEM, DOCUMENT_CONTRACT_SYSTEM, documentSystemFor } from '@/lib/ai/prompts';
import { TOUCHPOINTS } from '@/lib/ai/touchpoints';
import { containsBanned } from '@/lib/rules';
import {
  DOCUMENT_KINDS,
  FIELD_SPECS,
  fieldSpecsFor,
  isFieldKeyFor,
  PRIVATE_FIELD_KEYS,
} from '@/lib/documents/fields';
import { BIRTH_MASK, hasUnmaskedRrn, maskPersonalIds, RRN_MASK } from '@/lib/documents/mask';
import { normalizeDocumentFields, redactFieldsForLog, hasAnyValue } from '@/lib/documents/structure';
import {
  buildPageText,
  failureFromError,
  findValueBbox,
  itemBbox,
  toTextResult,
  PDF_TEXT_FALLBACK_MESSAGE,
  PDF_TEXT_FAILURE_DETAIL,
  type PdfToken,
} from '@/lib/documents/pdf-layout';
import { documentReadiness } from '@/lib/documents/readiness';
import { sanitizeFieldInputs } from '@/lib/documents/input';

/**
 * v2 3단계 — 문서 입력 (V2-PLAN §4-1 · §4-3 · docs/API-V2.md §1~§3)
 *
 * 모델·pdf.js·IndexedDB는 부르지 않는다. 그 앞뒤의 순수 함수(마스킹 · 응답 정규화 ·
 * 텍스트 레이어 판정 · 위치 매칭 · 준비 상태 · 저장 입력 정규화)를 검사한다.
 */

/* ══════════════════════════════════════════════════════════════
   마스킹 (R9) — 전송 전 주민등록번호·생년월일
   ══════════════════════════════════════════════════════════════ */

describe('maskPersonalIds — 주민등록번호', () => {
  it('하이픈 있는 주민번호를 가린다', () => {
    const r = maskPersonalIds('소유자 홍길동 900101-1234567 경상북도');
    expect(r.text).toBe(`소유자 홍길동 ${RRN_MASK} 경상북도`);
    expect(r.masked).toBe(1);
  });

  it('하이픈 주변 공백·붙여 쓴 13자리도 가린다', () => {
    expect(maskPersonalIds('900101 - 2234567').text).toBe(RRN_MASK);
    expect(maskPersonalIds('번호 9001012234567 끝').text).toBe(`번호 ${RRN_MASK} 끝`);
  });

  it('뒷자리가 이미 가려진 표기도 앞 6자리(생년월일)까지 가린다', () => {
    expect(maskPersonalIds('(900101-1******)').text).toBe(`(${RRN_MASK})`);
    expect(maskPersonalIds('900101-*******').text).toBe(RRN_MASK);
  });

  it('외국인등록번호(뒷자리 5~8)도 가린다', () => {
    expect(maskPersonalIds('851231-5123456').text).toBe(RRN_MASK);
  });

  it('여러 개를 전부 가리고 개수를 센다', () => {
    const r = maskPersonalIds('갑 900101-1234567, 을 880202-2345678');
    expect(r.masked).toBe(2);
    expect(hasUnmaskedRrn(r.text)).toBe(false);
  });

  it('날짜 모양이 아닌 숫자열은 건드리지 않는다 — 금액·계좌·전화', () => {
    for (const s of ['₩30,000,000', '금 삼천만원정', '010-1234-5678', '123-456789-01-011', '991399-1234567']) {
      expect(maskPersonalIds(s).text, s).toBe(s);
    }
  });

  it('더 긴 숫자열의 일부는 주민번호로 보지 않는다', () => {
    const s = '19900101123456789';
    expect(maskPersonalIds(s).text).toBe(s);
  });
});

describe('maskPersonalIds — 생년월일', () => {
  it('"생년월일" 표지 뒤의 날짜를 가리고 표지는 남긴다', () => {
    expect(maskPersonalIds('생년월일: 1990.01.01').text).toBe(`생년월일: ${BIRTH_MASK}`);
    expect(maskPersonalIds('생년월일 1990년 1월 1일').text).toBe(`생년월일 ${BIRTH_MASK}`);
    expect(maskPersonalIds('생년월일(900101)').text).toBe(`생년월일(${BIRTH_MASK})`);
  });

  it('"…생" 표기를 가린다', () => {
    expect(maskPersonalIds('홍길동(1990.01.01생)').text).toBe(`홍길동(${BIRTH_MASK}생)`);
    expect(maskPersonalIds('1990년 1월 1일생').text).toBe(`${BIRTH_MASK}생`);
  });

  it('표지 없는 날짜는 가리지 않는다 — 임대차 기간·잔금일을 읽어야 한다', () => {
    const s = '임대차기간 2026년 3월 1일부터 2028년 2월 29일까지, 잔금일 2026.02.28';
    expect(maskPersonalIds(s).text).toBe(s);
  });

  it('"생" 뒤에 한글이 이어지면(생활·생략) 표지가 아니다', () => {
    const s = '2026.03.01 생활폐기물';
    expect(maskPersonalIds(s).text).toBe(s);
  });

  it('같은 입력이면 같은 결과다 (순수 · 전역 정규식 상태 없음)', () => {
    const s = '900101-1234567 / 생년월일 1990.01.01';
    expect(maskPersonalIds(s)).toEqual(maskPersonalIds(s));
    expect(hasUnmaskedRrn(s)).toBe(true);
    expect(hasUnmaskedRrn(s)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════
   ④ 응답 정규화 (R1 · R8)
   ══════════════════════════════════════════════════════════════ */

const REGISTRY_TEXT = [
  '[표제부] (1동의 건물의 표시)',
  '소재지번 가상도 가상시 가상동 123-4',
  '도로명주소 가상도 가상시 가상로 56',
  '건물명칭 가상빌',
  '철근콘크리트구조 다세대주택',
  '(전유부분의 건물의 표시) 제3층 제301호 철근콘크리트구조 29.5㎡',
  '[갑구] 소유권이전 소유자 홍길동 900101-1234567',
  '[을구] 근저당권설정 채권최고액 금60,000,000원',
  '근저당권설정 채권최고액 금24,000,000원',
].join('\n');

const MASKED_REGISTRY = maskPersonalIds(REGISTRY_TEXT).text;

describe('normalizeDocumentFields — 모델 출력을 믿지 않는다', () => {
  it('그 kind의 모든 칸을 공통 스키마 순서로 돌려준다 (빠진 칸은 null)', () => {
    const out = normalizeDocumentFields({ owner_name: '홍길동' }, 'registry', MASKED_REGISTRY);
    expect(out.map((f) => f.fieldKey)).toEqual(fieldSpecsFor('registry').map((s) => s.key));
    expect(out.find((f) => f.fieldKey === 'owner_name')?.value).toBe('홍길동');
    expect(out.filter((f) => f.value === null)).toHaveLength(out.length - 1);
  });

  it('원문 표기 그대로 옮긴 값은 통과한다 (공백 차이는 무시)', () => {
    const out = normalizeDocumentFields(
      {
        address_jibun: '가상도 가상시 가상동 123-4',
        area_exclusive: '29.5㎡',
        floor: '제3층',
        use: '다세대주택',
        lien_total: '금60,000,000원, 금24,000,000원',
      },
      'registry',
      MASKED_REGISTRY,
    );
    const v = Object.fromEntries(out.map((f) => [f.fieldKey, f.value]));
    expect(v.address_jibun).toBe('가상도 가상시 가상동 123-4');
    expect(v.area_exclusive).toBe('29.5㎡');
    expect(v.floor).toBe('제3층');
    expect(v.lien_total).toBe('금60,000,000원, 금24,000,000원');
  });

  it('원문에 없는 값(추정·환산·합산)은 null이다 (R8)', () => {
    const out = normalizeDocumentFields(
      {
        area_exclusive: '8.9평',            // 환산
        lien_total: '금84,000,000원',        // 합산
        owner_name: '김철수',                // 원문에 없는 성명
        structure: '철근콘크리트조',          // 비슷하지만 원문과 다른 표기
      },
      'registry',
      MASKED_REGISTRY,
    );
    for (const f of out) expect(f.value, f.fieldKey).toBeNull();
    expect(hasAnyValue(out)).toBe(false);
  });

  it('다른 kind의 키·모르는 키는 버린다', () => {
    const out = normalizeDocumentFields(
      { deposit: '금60,000,000원', lessor_name: '홍길동', 평가: '추천', score: 9 },
      'registry',
      MASKED_REGISTRY,
    );
    expect(out.some((f) => (f.fieldKey as string) === 'deposit')).toBe(false);
    expect(out.some((f) => (f.fieldKey as string) === 'lessor_name')).toBe(false);
    expect(hasAnyValue(out)).toBe(false);
  });

  it('문자열이 아닌 값은 버린다 — 숫자는 모델이 표기를 바꾼 것이다', () => {
    const out = normalizeDocumentFields({ area_exclusive: 29.5, floor: 3 }, 'registry', MASKED_REGISTRY);
    expect(hasAnyValue(out)).toBe(false);
  });

  it('"없음"·"N/A"·빈 문자열은 null이다 — 자리표시로 채우지 않는다', () => {
    const out = normalizeDocumentFields(
      { seizure_flags: '없음', building_name: 'N/A', structure: '  ', use: 'null' },
      'registry',
      MASKED_REGISTRY,
    );
    expect(hasAnyValue(out)).toBe(false);
  });

  it('판정성 표현이 섞인 값은 null이다 (R1)', () => {
    const text = `${MASKED_REGISTRY}\n비고 안전합니다`;
    const out = normalizeDocumentFields({ building_name: '안전합니다' }, 'registry', text);
    expect(hasAnyValue(out)).toBe(false);
  });

  it('confidence는 모델에게 묻지 않으므로 항상 null이다', () => {
    const out = normalizeDocumentFields({ floor: '제3층', confidence: 0.99 }, 'registry', MASKED_REGISTRY);
    for (const f of out) expect(f.confidence).toBeNull();
  });

  it('{ fields: {...} } 로 한 겹 감싸 와도 받는다', () => {
    const out = normalizeDocumentFields({ fields: { floor: '제3층' } }, 'registry', MASKED_REGISTRY);
    expect(out.find((f) => f.fieldKey === 'floor')?.value).toBe('제3층');
  });

  it('배열·null·문자열이 와도 전부 null인 칸 목록이다', () => {
    for (const raw of [null, undefined, [1, 2], '문장', 42]) {
      const out = normalizeDocumentFields(raw, 'contract', '아무 텍스트');
      expect(out).toHaveLength(fieldSpecsFor('contract').length);
      expect(hasAnyValue(out)).toBe(false);
    }
  });

  it('agent_flag는 true/false 문자열로만, 원문 대조 없이 받는다', () => {
    const pick = (v: unknown) =>
      normalizeDocumentFields({ agent_flag: v }, 'contract', '계약서').find((f) => f.fieldKey === 'agent_flag')?.value;
    expect(pick(true)).toBe('true');
    expect(pick('false')).toBe('false');
    expect(pick('예')).toBeNull();
    expect(pick(1)).toBeNull();
  });

  it('특약 원문은 줄바꿈을 유지해 옮긴다', () => {
    const text = '특약사항\n1. 가상 특약 첫째 줄\n2. 가상 특약 둘째 줄';
    const value = '1. 가상 특약 첫째 줄\n2. 가상 특약 둘째 줄';
    const out = normalizeDocumentFields({ special_terms: value }, 'contract', text);
    expect(out.find((f) => f.fieldKey === 'special_terms')?.value).toBe(value);
  });

  it('가림 표시가 든 값은 가림 표시 그대로 원문과 맞는다 — 복원된 번호는 원문에 없다', () => {
    const restored = normalizeDocumentFields({ owner_name: '홍길동 900101-1234567' }, 'registry', MASKED_REGISTRY);
    expect(restored.find((f) => f.fieldKey === 'owner_name')?.value).toBeNull();
    const kept = normalizeDocumentFields({ owner_name: `홍길동 ${RRN_MASK}` }, 'registry', MASKED_REGISTRY);
    expect(kept.find((f) => f.fieldKey === 'owner_name')?.value).toBe(`홍길동 ${RRN_MASK}`);
  });
});

describe('redactFieldsForLog — ai_logs에 성명·호수·특약 원문을 남기지 않는다', () => {
  it('성명·상세주소·특약 값은 [가림], 나머지는 그대로', () => {
    const text = '임대인 홍길동 예금주 홍길동 제301호 보증금 금30,000,000원 특약 1. 가상 특약';
    const fields = normalizeDocumentFields(
      {
        lessor_name: '홍길동',
        account_holder: '홍길동',
        address_detail: '제301호',
        special_terms: '1. 가상 특약',
        deposit: '금30,000,000원',
      },
      'contract',
      text,
    );
    const log = redactFieldsForLog(fields);
    expect(log).not.toContain('홍길동');
    expect(log).not.toContain('301');
    expect(log).not.toContain('가상 특약');
    expect(log).toContain('금30,000,000원');
    expect(JSON.parse(log).lessor_name).toBe('[가림]');
    expect(JSON.parse(log).rent).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════
   PDF 텍스트 레이어 — 폴백 판정 · 위치 계산
   ══════════════════════════════════════════════════════════════ */

describe('PDF 텍스트 추출 폴백', () => {
  it('모든 페이지가 공백뿐이면 no_text — 텍스트 레이어가 없다', () => {
    expect(toTextResult([{ page: 1, text: '' }, { page: 2, text: ' \n\t ' }], [])).toEqual({
      ok: false,
      reason: 'no_text',
    });
    expect(toTextResult([], [])).toEqual({ ok: false, reason: 'no_text' });
  });

  it('글자가 한 페이지에라도 있으면 성공이다', () => {
    const r = toTextResult([{ page: 1, text: '' }, { page: 2, text: '가상 문서' }], []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('가상 문서');
  });

  it('pdf.js 예외 → 이유. 암호·손상·그 밖의 실패를 가른다', () => {
    expect(failureFromError({ name: 'PasswordException', message: 'No password given' })).toBe('encrypted');
    expect(failureFromError({ name: 'InvalidPDFException' })).toBe('invalid');
    expect(failureFromError(new Error('network'))).toBe('load_failed');
    expect(failureFromError(null)).toBe('load_failed');
    expect(failureFromError('문자열')).toBe('load_failed');
  });

  it('어떤 실패든 화면 문구는 "직접 입력"으로 이어진다', () => {
    expect(PDF_TEXT_FALLBACK_MESSAGE).toBe('텍스트를 찾지 못했습니다. 직접 입력해 주세요');
    for (const detail of Object.values(PDF_TEXT_FAILURE_DETAIL)) {
      expect(detail).not.toBe('');
      expect(containsBanned(detail)).toBe(false);
    }
  });

  it('hasEOL이면 줄을 바꿔 이어 붙인다', () => {
    expect(buildPageText([{ str: '소재지', hasEOL: false }, { str: ' 가상로', hasEOL: true }, { str: '면적' }])).toBe(
      '소재지 가상로\n면적',
    );
  });
});

describe('itemBbox — 페이지 대비 비율, 왼쪽 위 원점', () => {
  // A4 세로 595×842, scale 1 뷰포트: y축을 뒤집는 [1,0,0,-1,0,842]
  const viewport = { transform: [1, 0, 0, -1, 0, 842], width: 595, height: 842 };

  it('기준선 왼쪽 점(e,f)과 폭·높이로 비율 좌표를 만든다', () => {
    const b = itemBbox(1, [10, 0, 0, 10, 59.5, 742], 119, 10, viewport);
    expect(b?.page).toBe(1);
    expect(b?.x).toBeCloseTo(0.1);
    expect(b?.w).toBeCloseTo(0.2);
    expect(b?.y).toBeCloseTo((842 - 752) / 842);
    expect(b?.h).toBeCloseTo(10 / 842);
  });

  it('높이가 0이면 글꼴 행렬 크기로 대신한다', () => {
    const b = itemBbox(1, [0, 0, 0, 12, 0, 100], 50, 0, viewport);
    expect(b?.h).toBeCloseTo(12 / 842);
  });

  it('폭이 없거나 숫자가 아니면 null — 위치 추정', () => {
    expect(itemBbox(1, [10, 0, 0, 10, 0, 0], 0, 10, viewport)).toBeNull();
    expect(itemBbox(1, [10, 0, 0, 10, NaN, 0], 10, 10, viewport)).toBeNull();
    expect(itemBbox(1, [10, 0, 0, 10, 0, 0], 10, 10, { ...viewport, width: 0 })).toBeNull();
  });
});

describe('findValueBbox — 값 → 원문 위치 (확실할 때만)', () => {
  const box = (page: number, x: number) => ({ page, x, y: 0.1, w: 0.05, h: 0.02 });
  const tokens: PdfToken[] = [
    { page: 1, str: '소유자', bbox: box(1, 0.1) },
    { page: 1, str: '홍길', bbox: box(1, 0.2) },
    { page: 1, str: '동', bbox: box(1, 0.25) },
    { page: 1, str: '제3층', bbox: box(1, 0.4) },
    { page: 2, str: '제3층', bbox: box(2, 0.4) },
    { page: 2, str: '가상빌', bbox: null },
  ];

  it('여러 토큰에 걸친 값은 토큰 bbox를 합친다', () => {
    const b = findValueBbox(tokens, '홍길동');
    expect(b).not.toBeNull();
    expect(b?.page).toBe(1);
    expect(b?.x).toBeCloseTo(0.2);
    expect(b?.w).toBeCloseTo(0.1);
  });

  it('두 곳 이상에 있으면 null — 엉뚱한 곳을 칠하지 않는다', () => {
    expect(findValueBbox(tokens, '제3층')).toBeNull();
  });

  it('못 찾거나 토큰 위치가 없거나 너무 짧으면 null', () => {
    expect(findValueBbox(tokens, '김철수')).toBeNull();
    expect(findValueBbox(tokens, '가상빌')).toBeNull();
    expect(findValueBbox(tokens, '동')).toBeNull();
    expect(findValueBbox(tokens, null)).toBeNull();
  });
});

describe('pdf.js worker 자체 호스팅 (CDN 금지)', () => {
  it('public/pdfjs/ worker가 설치된 pdfjs-dist 배포 파일과 같다 — 버전을 올리면 같이 바꾼다', () => {
    const hosted = readFileSync('public/pdfjs/pdf.worker.min.mjs');
    const shipped = readFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
    expect(hosted.equals(shipped)).toBe(true);
  });

  it('추출 모듈은 pdfjs-dist를 동적 import하고 자체 호스팅 경로를 쓴다', () => {
    const src = readFileSync('lib/client/pdf-text.ts', 'utf8');
    expect(src).toContain("await import('pdfjs-dist')");
    expect(src).not.toMatch(/^import .*from 'pdfjs-dist'/m);
    expect(src).toContain("'/pdfjs/pdf.worker.min.mjs'");
    expect(src).not.toMatch(/https?:\/\//);
  });
});

/* ══════════════════════════════════════════════════════════════
   R9 — 원본은 기기에만
   ══════════════════════════════════════════════════════════════ */

describe('원본 보관함 (lib/client/vault.ts)', () => {
  it('네트워크 코드가 없다 — 원본을 서버로 보내는 경로가 없다', () => {
    const src = readFileSync('lib/client/vault.ts', 'utf8');
    for (const pat of [/fetch\(/, /XMLHttpRequest/, /sendBeacon/, /FormData/, /['"]use server['"]/]) {
      expect(src, String(pat)).not.toMatch(pat);
    }
    expect(src.startsWith("'use client';")).toBe(true);
  });

  it('④ 호출 래퍼는 텍스트만 보낸다 — Blob·File·FormData를 본문에 넣지 않는다', () => {
    const src = readFileSync('lib/client/document-api.ts', 'utf8');
    expect(src).not.toContain('FormData');
    expect(src).toMatch(/JSON\.stringify\(\{ propertyId, kind, text: maskedText \}\)/);
    // 마스킹이 전송보다 먼저다
    expect(src.indexOf('maskPersonalIds(')).toBeLessThan(src.indexOf('fetch('));
  });

  it('lib/client/* 는 전부 use client 모듈이다', () => {
    for (const f of readdirSync('lib/client')) {
      const src = readFileSync(`lib/client/${f}`, 'utf8');
      expect(src.startsWith("'use client';"), f).toBe(true);
    }
  });
});

/* ══════════════════════════════════════════════════════════════
   R7 — 상세주소·특약 원문은 인쇄·공유 경로에 넣지 않는다
   ══════════════════════════════════════════════════════════════ */

describe('R7 — 인쇄 컴포넌트에 문서 개인 필드가 없다', () => {
  it('*-print.tsx 는 address_detail · special_terms 를 참조하지 않는다', () => {
    const prints = readdirSync('components/screens').filter((f) => f.endsWith('-print.tsx'));
    expect(prints.length).toBeGreaterThan(0);
    for (const f of prints) {
      const src = readFileSync(`components/screens/${f}`, 'utf8');
      for (const key of PRIVATE_FIELD_KEYS) expect(src, `${f}: ${key}`).not.toContain(key);
    }
  });

  it('개인 필드는 상세주소·특약 둘이다', () => {
    expect([...PRIVATE_FIELD_KEYS].sort()).toEqual(['address_detail', 'special_terms']);
  });
});

/* ══════════════════════════════════════════════════════════════
   공통 스키마 · 준비 상태 · 저장 입력
   ══════════════════════════════════════════════════════════════ */

describe('공통 스키마 (V2-PLAN §4-1 표)', () => {
  it('키가 중복 없이 26개다', () => {
    const keys = FIELD_SPECS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(26);
  });

  it('표의 ○·— 배치를 따른다 (대표 칸)', () => {
    expect(isFieldKeyFor('registry', 'owner_name')).toBe(true);
    expect(isFieldKeyFor('contract', 'owner_name')).toBe(false);
    expect(isFieldKeyFor('contract', 'lessor_name')).toBe(true);
    expect(isFieldKeyFor('registry', 'deposit')).toBe(false);
    expect(isFieldKeyFor('ad', 'special_terms')).toBe(false);
    expect(isFieldKeyFor('contract', 'special_terms')).toBe(true);
    expect(isFieldKeyFor('registry', 'lien_total')).toBe(true);
    expect(isFieldKeyFor('ad', 'toString')).toBe(false);
  });

  it('모든 라벨·설명에 판정성 표현이 없다', () => {
    for (const s of FIELD_SPECS) expect(containsBanned(`${s.label} ${s.note ?? ''}`), s.key).toBe(false);
  });
});

describe('documentReadiness — 문서 준비 상태 패널 (V2-PLAN §4-3)', () => {
  it('등기부 · 광고 · 계약서 순서로 ○/×를 보여 준다', () => {
    expect(documentReadiness(['registry', 'ad']).summary).toBe('등기부 ○ · 광고 ○ · 계약서 ×');
  });

  it('2종 미만이면 대조를 잠그고 이유를 준다', () => {
    const none = documentReadiness([]);
    expect(none.canCompare).toBe(false);
    expect(none.reason).toContain('2종 이상');

    const one = documentReadiness(['contract', 'contract']);
    expect(one.count).toBe(1);
    expect(one.canCompare).toBe(false);
    expect(one.reason).toContain('등기부·광고');
  });

  it('2종 이상이면 대조를 열고 이유가 없다', () => {
    for (const kinds of [['registry', 'contract'], [...DOCUMENT_KINDS]] as const) {
      const r = documentReadiness(kinds);
      expect(r.canCompare).toBe(true);
      expect(r.reason).toBeNull();
    }
  });
});

describe('sanitizeFieldInputs — saveDocument 입력을 믿지 않는다', () => {
  it('그 kind의 키만, 같은 키는 처음 것만 남긴다', () => {
    const r = sanitizeFieldInputs('registry', [
      { fieldKey: 'owner_name', value: '홍길동', bbox: null, confidence: null, editedByUser: false },
      { fieldKey: 'owner_name', value: '김철수', bbox: null, confidence: null, editedByUser: true },
      { fieldKey: 'deposit', value: '금1원', bbox: null, confidence: null, editedByUser: true },
      { fieldKey: 'hack', value: 'x' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields).toHaveLength(1);
      expect(r.fields[0]).toMatchObject({ fieldKey: 'owner_name', value: '홍길동' });
    }
  });

  it('공백뿐인 값은 null이다 (R8)', () => {
    const r = sanitizeFieldInputs('contract', [{ fieldKey: 'rent', value: '   ', editedByUser: true }]);
    expect(r.ok && r.fields[0].value).toBeNull();
  });

  it('bbox·confidence는 형태가 맞을 때만 받는다', () => {
    const r = sanitizeFieldInputs('contract', [
      { fieldKey: 'rent', value: '금1원', bbox: { page: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, confidence: 0.5 },
      { fieldKey: 'deposit', value: '금2원', bbox: { page: 0, x: 0, y: 0, w: 1, h: 1 }, confidence: 7 },
      { fieldKey: 'floor', value: '1층', bbox: 'x', confidence: '0.5' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields[0].bbox).toEqual({ page: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.1 });
      expect(r.fields[0].confidence).toBe(0.5);
      expect(r.fields[1].bbox).toBeNull();
      expect(r.fields[1].confidence).toBeNull();
      expect(r.fields[2].bbox).toBeNull();
      expect(r.fields[2].confidence).toBeNull();
    }
  });

  it('editedByUser는 true일 때만 true다', () => {
    const r = sanitizeFieldInputs('contract', [{ fieldKey: 'rent', value: '금1원', editedByUser: 'yes' }]);
    expect(r.ok && r.fields[0].editedByUser).toBe(false);
  });

  it('너무 긴 값은 저장하지 않고 이유를 준다 — 잘라서 저장하지 않는다', () => {
    const r = sanitizeFieldInputs('contract', [{ fieldKey: 'rent', value: '가'.repeat(201) }]);
    expect(r.ok).toBe(false);
    const long = sanitizeFieldInputs('contract', [{ fieldKey: 'special_terms', value: '가'.repeat(3000) }]);
    expect(long.ok).toBe(true);
  });

  it('배열이 아니면 실패다', () => {
    expect(sanitizeFieldInputs('ad', null).ok).toBe(false);
    expect(sanitizeFieldInputs('ad', { fieldKey: 'rent' }).ok).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════
   ④ 프롬프트·라우트 (R1 · R3 · R8 · R9)
   ══════════════════════════════════════════════════════════════ */

describe('④ 문서 구조화 프롬프트', () => {
  const KIND_PROMPTS = [
    ['registry', DOCUMENT_REGISTRY_SYSTEM],
    ['contract', DOCUMENT_CONTRACT_SYSTEM],
  ] as const;

  it('④는 active 지점이다', () => {
    expect(TOUCHPOINTS.document_structure.status).toBe('active');
  });

  it('등기부·계약서 프롬프트가 따로 있고 둘 다 판정 금지 지시를 포함한다', () => {
    expect(DOCUMENT_REGISTRY_SYSTEM).not.toBe(DOCUMENT_CONTRACT_SYSTEM);
    for (const [kind, prompt] of KIND_PROMPTS) {
      expect(prompt, kind).toContain(NO_JUDGMENT_RULE);
      expect(documentSystemFor(kind), kind).toBe(prompt);
    }
  });

  it('광고는 ④ 대상이 아니다 — 이미지는 수기, 광고 문구는 ① 흐름', () => {
    expect(documentSystemFor('ad')).toBeNull();
  });

  it('못 찾으면 null, 추측 금지, 옮겨 적기만, 합산 금지를 지시한다 (R8 · R2)', () => {
    for (const [kind, prompt] of KIND_PROMPTS) {
      expect(prompt, kind).toContain('null로 둔다');
      expect(prompt, kind).toContain('추측');
      expect(prompt, kind).toContain('그대로 옮겨');
      expect(prompt, kind).toContain('합산');
    }
  });

  it('가림 표시를 복원하지 말라고 지시한다 (R9)', () => {
    for (const [kind, prompt] of KIND_PROMPTS) {
      expect(prompt, kind).toContain(RRN_MASK);
      expect(prompt, kind).toContain(BIRTH_MASK);
      expect(prompt, kind).toContain('복원하지 않는다');
    }
  });

  it('프롬프트 스키마의 키가 그 kind의 공통 스키마 키와 정확히 같다', () => {
    for (const [kind, prompt] of KIND_PROMPTS) {
      const keys = [...prompt.matchAll(/^\s+"([a-z_]+)":/gm)].map((m) => m[1]);
      expect(keys, kind).toEqual(fieldSpecsFor(kind).map((s) => s.key));
    }
  });

  it('④ 라우트는 kind별 프롬프트를 쓰고 모델 호출 전에 다시 마스킹한다', () => {
    const src = readFileSync('app/api/ai/document/route.ts', 'utf8');
    expect(src).toContain('documentSystemFor(');
    expect(src.indexOf('maskPersonalIds(input)')).toBeGreaterThan(-1);
    expect(src.indexOf('maskPersonalIds(input)')).toBeLessThan(src.indexOf('generate({'));
  });

  it('④ 라우트는 ai_logs에 원문을 남기지 않는다 — kind·글자 수와 가린 필드만', () => {
    const src = readFileSync('app/api/ai/document/route.ts', 'utf8');
    const firstArgs = [...src.matchAll(/logAi\(\s*'document_structure',\s*([a-zA-Z]+)/g)].map((m) => m[1]);
    expect(firstArgs.length).toBeGreaterThan(0);
    for (const a of firstArgs) expect(a).toBe('logInput');
    expect(src).toContain('const logInput = `${kind} · ${text.length}자`');
    expect(src).toContain('redactFieldsForLog(fields)');
    expect(src).not.toMatch(/logAi\([^)]*result\.text/);
  });

  it('④ 라우트는 결과를 DB에 저장하지 않는다 — 저장은 확인 화면 뒤 saveDocument', () => {
    const src = readFileSync('app/api/ai/document/route.ts', 'utf8');
    expect(src).not.toMatch(/db\.(insert|update|delete)/);
    expect(src).not.toContain("from '@/db'");
  });
});
