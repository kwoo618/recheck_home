import 'server-only';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Neon HTTP 드라이버 기반 Drizzle 클라이언트.
 *
 * ★ R6: DATABASE_URL은 서버 전용이다. 'server-only' 임포트로 클라이언트 번들에
 *   섞이면 빌드가 실패하도록 강제한다.
 * ★ Neon HTTP는 커넥션 풀을 유지하지 않으므로 서버리스(Vercel)에서 콜드스타트 부담이 없다.
 *   단, 트랜잭션(db.transaction)은 HTTP 드라이버에서 지원되지 않으므로
 *   여러 쓰기를 묶어야 할 때는 순차 실행 + 보정 로직으로 처리한다.
 */

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL이 설정되지 않았습니다. .env.example을 참고해 .env.local에 Neon 연결 문자열을 넣어주세요.',
  );
}

export const db = drizzle(neon(url), { schema });

export { schema };
