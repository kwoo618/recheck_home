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

/**
 * 기본 모델.
 *
 * 2026-08-11 실호출 측정: 응답 3.7초. 8초 타임아웃 안에 여유가 있다.
 *
 * ★ `gemini-2.5-flash` / `gemini-2.5-flash-lite`는 쓸 수 없다 —
 *   generateContent가 404 "no longer available to new users"를 돌려준다.
 * ★ `gemini-flash-latest` 같은 별칭은 쓰지 않는다. 자동 갱신이라
 *   발표 당일 모델이 바뀔 수 있고, 측정 시 5~6초대로 타임아웃에 근접했다.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash';

/**
 * 기본 모델 실패·한도 초과 시 재시도할 모델.
 * 2026-08-11 실호출 측정: 응답 1.1초. 기본보다 3배 빨라 지연 상황에서 체감이 낫다.
 */
export const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

/** 시도 순서 — 이 배열을 앞에서부터 시도하고, 전부 실패하면 템플릿 폴백 */
export const GEMINI_MODEL_CHAIN = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL] as const;

/**
 * 호출 타임아웃(ms).
 *
 * 사용자는 "AI가 느린 것"보다 "화면이 멈춘 것"을 더 크게 느낀다.
 * 시간을 넘기면 기다리지 말고 템플릿 폴백으로 내려간다. (PRD §11)
 *
 * 2026-08-11 실측: parse 6.1초 / summary 5.9초 / questions 4.8초.
 * 8초로 두면 parse의 여유가 1.9초뿐이라 발표 당일 네트워크가 느리면 폴백으로 빠진다.
 * 폴백이 있으므로 늘려도 최악은 템플릿 질문이다 — 그보다 정상 응답을 받는 편이 낫다.
 */
export const GEMINI_TIMEOUT_MS = 12000;

/**
 * 응답 토큰 상한.
 *
 * ★ Gemini 3.x는 추론(thinking) 토큰을 이 상한에 **함께** 계산한다.
 *   실측(2026-08-11): 질문 3개를 만드는 데 thoughtsTokenCount 803 + 답변 65 = 868.
 *   1024로 두면 답변이 조금만 길어져도 잘리고, 잘린 JSON은 파싱에 실패해
 *   "AI는 응답했는데 결과가 0건"이 된다. 실제로 그 증상이 났다.
 *
 * 상한을 올려도 생성한 만큼만 과금되므로 여유를 두는 편이 낫다.
 */
export const GEMINI_MAX_OUTPUT_TOKENS = 4096;

/**
 * ⚠ 확인 필요 (R8): 무료 티어의 RPM(분당)·RPD(일일) 요청 한도는 공식 문서에서
 *   확인하지 못했습니다. D2 저녁 라우트 구현 후 연속 호출로 실측해 값을 채우세요.
 *   실측 전까지 이 값에 의존하는 제한 로직을 넣지 마세요.
 *   (docs/INFRA.md §3 미해결 표 참조)
 */
export const GEMINI_RATE_LIMIT_UNKNOWN = true;
