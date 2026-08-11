import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// drizzle-kit은 Next.js 런타임 밖에서 실행되므로 .env.local을 직접 읽어야 한다.
config({ path: '.env.local' });

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // generate(SQL 생성)에는 불필요. migrate/studio 실행 시에만 필요하다.
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
