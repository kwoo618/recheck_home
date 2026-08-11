/**
 * Gemini 모델 설정 — 단일 관리 지점.
 *
 * AI 라우트 3종(parse / questions / summary)은 반드시 이 상수를 임포트해서 쓴다.
 * 모델명을 라우트마다 문자열로 박아 두면 교체할 때 한 군데를 빠뜨리게 되고,
 * 그 라우트만 조용히 다른 모델로 돌아간다.
 *
 * ★ 이 파일에는 모델명과 호출 파라미터만 둔다. API 키는 서버 환경변수에서만 읽는다. (R6)
 * ★ 폴백은 "모델이 죽었을 때"의 1차 대응일 뿐이다. 폴백 모델까지 실패하면
 *   템플릿 응답으로 내려가야 한다. 어떤 경우에도 라우트는 HTTP 200 + {ok:false}. (R4)
 */

/** 기본 모델 */
export const GEMINI_MODEL = 'gemini-2.5-flash';

/** 기본 모델 실패·한도 초과 시 재시도할 모델 */
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/** 시도 순서 — 이 배열을 앞에서부터 시도하고, 전부 실패하면 템플릿 폴백 */
export const GEMINI_MODEL_CHAIN = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL] as const;

/**
 * 호출 타임아웃(ms).
 * 사용자는 "AI가 느린 것"보다 "화면이 멈춘 것"을 더 크게 느낀다.
 * 시간을 넘기면 기다리지 말고 템플릿 폴백으로 내려간다. (PRD §11)
 */
export const GEMINI_TIMEOUT_MS = 8000;

/**
 * ⚠ 확인 필요 (R8): 무료 티어의 RPM(분당)·RPD(일일) 요청 한도는 공식 문서에서
 *   확인하지 못했습니다. D2 저녁 라우트 구현 후 연속 호출로 실측해 값을 채우세요.
 *   실측 전까지 이 값에 의존하는 제한 로직을 넣지 마세요.
 *   (docs/INFRA.md §3 미해결 표 참조)
 */
export const GEMINI_RATE_LIMIT_UNKNOWN = true;
