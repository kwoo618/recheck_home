/**
 * Node 모듈 해석 훅 — `@/…` 별칭을 저장소 루트로 돌린다.
 *
 * 왜 필요한가: v2부터 lib/rules.ts가 `@/lib/compare/text`를 **값으로** 임포트한다.
 * Next·vitest는 tsconfig paths로 풀지만, 러너는 `node`가 직접 실행하므로 `@/`를 모른다.
 * 그대로 두면 `Cannot find package '@/lib'`로 임포트 단계에서 죽는다.
 *
 * 쓰는 법: package.json 스크립트가 `node --import ./tests/e2e/_register-alias.mts …`로 등록한다.
 * qa:* · e2e:v2 전부 이 방식이다. 새 러너 스크립트를 추가할 때도 --import를 붙일 것.
 *
 * ★ 러너 전용. 앱 코드의 해석 방식은 바꾸지 않는다.
 */

import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

type Next = (specifier: string, context: unknown) => Promise<unknown>;

export async function resolve(specifier: string, context: unknown, next: Next): Promise<unknown> {
  if (specifier.startsWith('@/')) {
    const base = fileURLToPath(new URL(specifier.slice(2), ROOT));
    for (const ext of CANDIDATES) {
      if (isFile(base + ext)) return next(pathToFileURL(base + ext).href, context);
    }
  }
  return next(specifier, context);
}
