'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session-cookie';
import type { ActionResult } from '@/lib/types';

/**
 * 새 세션 시작 (PRD §8.1 — 익명 세션 UUID 쿠키)
 *
 * ★★ 데이터를 지우지 않는다. ★★
 *   쿠키 값만 새 UUID로 바꾼다. 기존 매물·조사지·질문·기록은 DB에 그대로 남고,
 *   **접근 경로만 끊긴다.** "초기화"도 "삭제"도 "캐시 비우기"도 아니다 —
 *   이 파일에 DELETE 는 없고, 앞으로도 넣지 않는다.
 *
 *   그래서 이름이 startNewSession 이다. 화면 문구도 "새로 시작"이어야 한다.
 *   "초기화"라고 쓰면 사용자는 데이터가 지워졌다고 이해하는데 그건 사실이 아니고,
 *   반대로 "지워졌겠지" 하고 안심하는 것도 사실이 아니다. 둘 다 틀린 안내다.
 *
 * ★ 되돌릴 수 없다. 이전 쿠키 값을 어디에도 남기지 않으므로 옛 세션의 매물에는
 *   다시 접근할 방법이 없다. 화면이 확인 단계를 두는 이유다.
 *
 * ★ 쿠키 발급 규약은 proxy.ts 와 공유한다(`lib/session-cookie.ts`).
 *   httpOnly · SameSite=lax · maxAge 1년 · 운영에서만 secure — 값을 여기서 다시 정하지 않는다.
 *
 * ★ redirect() 를 부르지 않는다.
 *   화면(`components/screens/_parts/session-reset.tsx`)이 결과를 받은 뒤 router.refresh() 로
 *   직접 갱신한다. 여기서 redirect 를 던지면 그쪽 try/catch 가 NEXT_REDIRECT 를 잡아
 *   "지금 새로 시작할 수 없어요"라는 **틀린 에러 문구**를 띄운다.
 *   버튼이 홈에 있으므로 홈으로 보내는 이동 자체도 의미가 없다.
 */
export async function startNewSession(): Promise<ActionResult<void>> {
  try {
    const store = await cookies();

    store.set({
      name: SESSION_COOKIE,
      value: crypto.randomUUID(),
      ...SESSION_COOKIE_OPTIONS,
    });
  } catch {
    // 쿠키를 쓸 수 없는 상황에서도 예외를 밖으로 내보내지 않는다 (R4).
    // 프론트가 try/catch 없이 ok 만 보고 분기할 수 있어야 한다.
    return { ok: false, error: '지금 새로 시작할 수 없어요. 잠시 후 다시 시도해 주세요.' };
  }

  // 바뀐 쿠키로 홈을 다시 렌더해야 한다. 그래야 매물 0건 랜딩이 나온다.
  revalidatePath('/');

  return { ok: true, data: undefined };
}
