import 'server-only';

import { db } from '@/db';
import { aiLogs, type AiFeature } from '@/db/schema';
import { containsBanned } from '@/lib/rules';
import { GEMINI_MODEL_CHAIN, GEMINI_TIMEOUT_MS, GEMINI_MAX_OUTPUT_TOKENS } from './models';

/**
 * Gemini 호출 공통 계층 (PRD v2.1 §8.2 · R1 · R4 · R6)
 *
 * 여기가 책임지는 것:
 *   · 모델 체인 순차 시도 (기본 → 폴백). 전부 실패하면 호출부가 템플릿으로 내려간다.
 *   · 제한 시간. 사용자는 "AI가 느린 것"보다 "화면이 멈춘 것"을 더 크게 느낀다.
 *   · 금칙어 필터. 프롬프트 가드레일이 새더라도 여기서 걸러 사용자에게 노출하지 않는다.
 *   · ai_logs 기록. 발표에서 AI 입출력을 대조해 보여주기 위한 자료다.
 *
 * ★ R6: GEMINI_API_KEY는 이 모듈 안에서만 읽는다. 'server-only'로 클라이언트 유입을 막는다.
 *
 * 요청/응답 형태는 2026-08-11 실호출로 검증했다 (모델·토큰 상한은 docs/INFRA.md 측정표 참조).
 * 무료 티어 RPM/RPD 한도는 아직 미확인이므로, 그 값에 의존하는 제한 로직은 넣지 않았다. (R8)
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GenerateFailure =
  | 'no_key'      // 키 미발급 — 폴백으로 내려간다
  | 'unavailable' // 모델 체인 전부 실패 (네트워크·한도·타임아웃)
  | 'empty'       // 응답은 왔으나 텍스트가 없음
  | 'banned';     // 판정성 표현이 섞여 필터에 걸림

export type GenerateResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: GenerateFailure };

type GenerateOptions = {
  system: string;
  user: string;
  /** JSON 응답을 요구할지 */
  json?: boolean;
};

/**
 * 모델 체인을 앞에서부터 시도한다.
 * 어떤 실패든 예외를 던지지 않고 결과값으로 돌려준다 — 호출부가 폴백을 그리게 하기 위함.
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  for (const model of GEMINI_MODEL_CHAIN) {
    const text = await callModel(model, key, options);
    if (text === null) continue; // 이 모델은 실패 — 다음 모델로

    if (!text.trim()) return { ok: false, reason: 'empty' };

    // ★ 이중 장치의 두 번째: 프롬프트가 새더라도 여기서 막는다.
    if (containsBanned(text)) return { ok: false, reason: 'banned' };

    return { ok: true, text, model };
  }

  return { ok: false, reason: 'unavailable' };
}

/** 한 모델에 1회 시도. 실패하면 null (예외를 밖으로 내보내지 않는다) */
async function callModel(
  model: string,
  key: string,
  { system, user, json }: GenerateOptions,
): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 키를 쿼리스트링이 아니라 헤더로 보낸다 (URL 로그에 남지 않게)
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          // 같은 입력에 같은 결과가 나오는 편이 발표·디버깅에 유리하다.
          temperature: 0,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const body = (await res.json()) as {
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };

    const candidate = body.candidates?.[0];

    // 정상 종료가 아니면 내용이 잘려 있다(MAX_TOKENS·SAFETY 등).
    // 잘린 JSON은 파싱에 실패해 "응답은 왔는데 결과가 0건"이 되므로, 실패로 보고 다음 모델로 넘긴다.
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') return null;

    const parts = candidate?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('').trim();

    return text || null;
  } catch {
    // 네트워크 오류·타임아웃·JSON 파싱 실패 — 전부 "이 모델은 실패"로 수렴시킨다.
    return null;
  }
}

/**
 * AI 입출력 기록 (발표용 대조 자료).
 *
 * ★ 로그 실패가 기능을 막지 않는다. DB가 죽어도 AI 응답은 사용자에게 가야 한다.
 * ★ 입력은 요약만 남긴다. 붙여넣은 매물 텍스트 전문을 보관할 이유가 없다.
 */
export async function logAi(
  feature: AiFeature,
  inputSummary: string,
  outputText: string,
  filtered: boolean,
): Promise<void> {
  try {
    await db.insert(aiLogs).values({
      feature,
      inputSummary: inputSummary.slice(0, 300),
      outputText: outputText.slice(0, 2000),
      filtered,
    });
  } catch {
    // 기록 실패는 무시한다.
  }
}
