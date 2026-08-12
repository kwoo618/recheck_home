/**
 * 스크린샷 러너 공통 상수 — seed.mts / shoot.mts가 함께 쓴다.
 *
 * ★ 이 디렉터리의 목적은 "테스트"가 아니라 **세션에 눈을 달아주는 것**이다.
 *   단언(assertion)을 쓰지 않는다. 사진만 남기고 판단은 사람이 한다.
 *   셀렉터도 쓰지 않는다 — URL을 열고 찍기만 하므로 화면이 바뀌어도 러너가 깨지지 않는다.
 *
 * ★ id를 전부 고정한 이유: 실행할 때마다 같은 경로·같은 파일명이 나와야
 *   이전 실행의 사진과 나란히 놓고 비교할 수 있다. 랜덤 UUID면 매번 다른 파일이 된다.
 */

/** QA 전용 세션. proxy.ts의 UUID 검증(v4 형식)을 통과해야 한다. */
export const QA_SESSION_ID = '5c1e0a7e-0000-4000-8000-000000000001';

/**
 * ⚠ 이 세션 외의 행은 절대 건드리지 않는다.
 *   DB에는 팀원들이 배포본을 쓰며 만든 세션이 섞여 있고,
 *   `DELETE FROM users`는 FK CASCADE로 그것까지 전부 지운다. (docs/INFRA.md §1)
 */
export const QA_PROPERTY_IDS = {
  /** ① 월세 — 팀원 안내문(WORKFLOW.md §5)의 대구대로 238 데이터 */
  monthly: '5c1e0a7e-0001-4000-8000-000000000001',
  /** ② 전세 — 안내문의 진량내리길 30 데이터 */
  jeonse: '5c1e0a7e-0002-4000-8000-000000000002',
  /** ③ 연식·가격·관리비를 비운 매물 — 0 표시 확인용 */
  empty: '5c1e0a7e-0003-4000-8000-000000000003',
  /** ④ 공백 없는 30자 이름 + 좌표 없음 — 넘침·"위치 미지정" 확인용 */
  overflow: '5c1e0a7e-0004-4000-8000-000000000004',
  /** ⑤ 사글세 — 대구대 인근 자취방 상당수가 이 유형이다 (2026-08-12 추가) */
  prepaid: '5c1e0a7e-0005-4000-8000-000000000005',
} as const;

export const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:3000';

/**
 * ⚠ 반드시 포트 3000.
 * 카카오 JS 키가 `http://localhost:3000`과 배포 도메인에만 등록돼 있다.
 * 다른 포트로 띄우면 SDK가 `401 domain mismatched!`로 거부돼 폴백 리스트만 찍힌다.
 * 그러면 이 러너의 가장 큰 이득(지도 타일이 실제로 그려지는지)을 잃는다.
 */
export const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },   // 모바일 (현장 사용 시나리오)
  { name: '768', width: 768, height: 1024 },  // 태블릿·좁은 데스크톱
  { name: '1440', width: 1440, height: 900 }, // 데스크톱
] as const;

export type Target = {
  name: string;
  path: string;
  /** 이 상태 코드를 정상으로 본다. 기본 200. 404 화면은 404가 정상이다. */
  expectStatus?: number;
  note: string;
};

const P = QA_PROPERTY_IDS;

/** 캡처 대상. 페이지 라우트 8종을 전부 덮고, 값이 다른 변형을 몇 개 더 찍는다. */
export const TARGETS: Target[] = [
  { name: '01-home', path: '/', note: '홈 — 매물 4건 · 지도/리스트 하이브리드' },
  { name: '02-property-new', path: '/property/new', note: '매물 등록 — 탭 2개(직접 입력 / 붙여넣기)' },
  { name: '03-confirm-monthly', path: `/property/${P.monthly}/confirm`, note: '정보 확인 — 월세 매물' },
  { name: '04-confirm-empty', path: `/property/${P.empty}/confirm`, note: '정보 확인 — 연식·가격·관리비 0' },
  { name: '05-sheet-jeonse', path: `/property/${P.jeonse}/sheet`, note: '조사지 — 방문 전(결과 입력란 없어야 함, R5)' },
  { name: '06-record-monthly', path: `/property/${P.monthly}/record`, note: '방문 기록 — 결과·답변 입력됨' },
  { name: '07-compare', path: '/compare', note: '비교 — 활성 매물 4건 · 금융 프로필 있음' },
  { name: '08-safety-monthly', path: `/property/${P.monthly}/safety`, note: '안전 점검 — 필수 일부 미확인(경고 배너)' },
  { name: '09-contract-monthly', path: `/property/${P.monthly}/contract`, note: '계약 당일·계약 후' },
  { name: '10-sheet-overflow', path: `/property/${P.overflow}/sheet`, note: '조사지 — 30자 공백 없는 이름(넘침 확인)' },
  { name: '10b-confirm-prepaid', path: `/property/${P.prepaid}/confirm`, note: '정보 확인 — 사글세' },
  { name: '10c-safety-prepaid', path: `/property/${P.prepaid}/safety`, note: '안전 점검 — 사글세 전용 5항목' },
  { name: '11-not-found', path: '/no-such-route', expectStatus: 404, note: '404' },
];

/*
 * ⚠ `/admin`은 이 목록에 넣지 않는다.
 *
 * 토큰을 URL 에 실어야 하는데, 그러면 러너가 남기는 산출물(`console-errors.md`는 커밋된다)에
 * 토큰이 들어갈 경로가 생긴다. `maskPath()`로 값을 가리긴 하지만, **애초에 토큰을 러너에
 * 통과시키지 않는 편이 확실하다** — 가리는 코드는 언젠가 빠뜨리게 된다.
 *
 * /admin 화면을 봐야 할 때는 로컬 `.env.local` 값으로 **수동 1회** 찍는다:
 *   npx playwright screenshot --full-page "http://localhost:3000/admin?key=<토큰>" out.png
 * 찍은 파일은 `docs/qa/shots/` 아래(= .gitignore 대상)에 두거나 저장소 밖에 둔다.
 */

/** 인쇄 레이아웃 2종 — 별도 라우트가 없고 화면 안에서 window.print()로 띄운다. */
export const PDF_TARGETS: Target[] = [
  { name: 'print-survey-sheet', path: `/property/${P.jeonse}/sheet`, note: '조사지 인쇄' },
  { name: 'print-safety', path: `/property/${P.monthly}/safety`, note: '최종 점검표 인쇄' },
];

export const OUT_DIR = 'docs/qa';
export const SHOTS_DIR = `${OUT_DIR}/shots`;
export const PDF_DIR = `${OUT_DIR}/pdf`;
export const CONSOLE_REPORT = `${OUT_DIR}/console-errors.md`;

/** 네트워크가 잠잠해지기를 기다리는 상한(ms). 지도 SDK 때문에 안 올 수도 있어 상한을 둔다. */
export const NETWORK_IDLE_MS = 10000;

/** networkidle 이후 추가로 기다리는 시간(ms) — 타일 그리기·폰트 적용 여유. */
export const SETTLE_MS = 2000;
