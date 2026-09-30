/**
 * `node --import ./tests/e2e/_register-alias.mts …` 로 러너보다 먼저 불러, `@/` 별칭 훅(_alias.mts)을 등록한다.
 * 러너 안에서 등록하면 정적 import가 등록보다 먼저 풀려 소용이 없다. 그래서 --import로 앞에 둔다.
 */
import { register } from 'node:module';

register('./_alias.mts', import.meta.url);
