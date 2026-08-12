/**
 * 시연용 매물 시딩 — `docs/경산_대구대_매물_40건_시연용.md` 를 읽어 DB에 넣는다.
 *
 * 실행:
 *   npm run qa:demo          시연용 세션을 비우고 다시 넣는다
 *   npm run qa:demo -- --clean   시연용 세션만 삭제
 *
 * ★ **시연용 세션(`de100000…`)의 행만 건드린다.** 팀원 실사용 데이터는 손대지 않는다.
 *   "실사용 N건"이 발표에서 시연용보다 강한 숫자다.
 * ★ 표에 없는 값을 만들어내지 않는다. 비어 있으면 비어 있는 대로 넣는다 (R8).
 */

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';

import * as schema from '../../db/schema.ts';
import { selectVisitRules } from '../../lib/rules.ts';
import { distanceFromSchool } from '../../lib/geo.ts';
import { geocodeAddress } from '../../lib/geocode.ts';
import { DEMO_SESSION_ID } from '../../lib/demo-session.ts';

const SOURCE = 'docs/경산_대구대_매물_40건_시연용.md';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 이 없습니다. --env-file=.env.local 로 실행하세요.');
  process.exit(1);
}

const db = drizzle(neon(url), { schema });
const { users, properties, visitChecks } = schema;

/* ══════════════════════════════════════════════════════════════
   표 파싱
   ══════════════════════════════════════════════════════════════ */

type Row = {
  address: string;
  dealType: schema.DealType;
  deposit: number;
  price: number;
  mgmtFee: number;
  area: number;
  floor: string;
  age: number;
  heatingRaw: string;
};

const DEAL_TYPES: schema.DealType[] = ['전세', '월세', '매매', '사글세'];
const HEATINGS: schema.Heating[] = ['개별난방', '중앙난방', '지역난방', '모름'];

/**
 * 표의 난방 칸을 스키마 값으로 옮긴다.
 *
 * ★ "도시가스"는 **연료**이지 난방 방식이 아니다. 개별난방일 수도 지역난방일 수도 있다.
 *   개별난방으로 단정하면 우리가 모르는 사실을 지어내는 것이고(R8), 게다가 난방 방식은
 *   조사지 항목 선정의 입력값이라(`v-boiler`) 틀리면 확인 항목까지 어긋난다.
 *   → 스키마에 이미 있는 '모름'으로 넣는다. 사용자가 정보 확인 화면에서 고치는 설계다.
 */
function toHeating(raw: string): schema.Heating {
  const v = raw.trim();
  return (HEATINGS as string[]).includes(v) ? (v as schema.Heating) : '모름';
}

function toNum(raw: string): number {
  const v = raw.trim();
  if (v === '') return 0; // 표에 없는 값. 0 은 "미입력"으로 화면이 따로 표시한다
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseTable(): Row[] {
  const text = readFileSync(SOURCE, 'utf8');
  const rows: Row[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;

    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 9) continue;
    if (cells[0] === '주소' || /^-+$/.test(cells[0])) continue; // 헤더·구분선

    const dealType = cells[1] as schema.DealType;
    if (!DEAL_TYPES.includes(dealType)) {
      console.warn(`  ⚠ 알 수 없는 거래유형 "${cells[1]}" — 건너뜁니다: ${cells[0]}`);
      continue;
    }

    rows.push({
      address: cells[0],
      dealType,
      deposit: toNum(cells[2]),
      price: toNum(cells[3]),
      mgmtFee: toNum(cells[4]),
      area: toNum(cells[5]),
      floor: cells[6].trim(),
      age: toNum(cells[7]),
      heatingRaw: cells[8],
    });
  }

  return rows;
}

/** 매물 별칭 — 표에 이름 칸이 없으므로 주소의 길·번지 부분을 그대로 쓴다(지어내지 않는다) */
function nameOf(address: string): string {
  const tokens = address.trim().split(/\s+/);
  return tokens.slice(-2).join(' ') || address;
}

/* ══════════════════════════════════════════════════════════════ */

async function clean(): Promise<void> {
  await db.delete(properties).where(eq(properties.userId, DEMO_SESSION_ID));
  console.log('시연용 매물 삭제 완료 (실사용 데이터는 건드리지 않았습니다)');
}

async function seed(): Promise<void> {
  const rows = parseTable();
  console.log(`${SOURCE} → ${rows.length}건 읽음`);

  const byDeal = new Map<string, number>();
  for (const r of rows) byDeal.set(r.dealType, (byDeal.get(r.dealType) ?? 0) + 1);
  console.log('거래유형:', [...byDeal].map(([k, v]) => `${k} ${v}`).join(' · '));

  const gasCount = rows.filter((r) => toHeating(r.heatingRaw) === '모름').length;
  if (gasCount > 0) {
    console.log(`난방: 스키마에 없는 표기 ${gasCount}건 → '모름' 으로 저장 (도시가스는 연료이지 난방 방식이 아님)`);
  }

  await db
    .insert(users)
    .values({ id: DEMO_SESSION_ID, finance: {} })
    .onConflictDoNothing();

  await clean();

  let geocodeFail = 0;
  const failed: string[] = [];

  for (const [i, r] of rows.entries()) {
    const coords = await geocodeAddress(r.address);
    if (!coords) {
      geocodeFail += 1;
      failed.push(r.address);
    }

    const lat = coords?.latitude ?? null;
    const lng = coords?.longitude ?? null;

    const [created] = await db
      .insert(properties)
      .values({
        userId: DEMO_SESSION_ID,
        name: nameOf(r.address),
        address: r.address,
        addressDetail: '',
        latitude: lat,
        longitude: lng,
        distanceFromSchool: distanceFromSchool(lat, lng),
        dealType: r.dealType,
        price: r.price,
        deposit: r.deposit,
        mgmtFee: r.mgmtFee,
        area: String(r.area),
        age: r.age,
        heating: toHeating(r.heatingRaw),
        floor: r.floor,
        link: '',
        // 시연용은 전부 등록 직후 상태다. 진행 단계를 지어내지 않는다 —
        // 퍼널은 실사용 기준으로만 계산하므로 이 값이 전환율을 흔들지 않는다.
        status: 'prep',
      })
      .returning({ id: properties.id });

    const rules = selectVisitRules({
      dealType: r.dealType,
      age: r.age,
      heating: toHeating(r.heatingRaw),
      floor: r.floor,
      deposit: r.deposit,
    });

    await db.insert(visitChecks).values(
      rules.map((rule, index) => ({
        propertyId: created.id,
        ruleId: rule.id,
        category: rule.category,
        title: rule.title,
        description: rule.description,
        result: '' as schema.VisitResult,
        memo: '',
        sort: index,
      })),
    );

    if ((i + 1) % 10 === 0) console.log(`  … ${i + 1}/${rows.length}`);

    // 카카오 로컬 API 한도는 미확인이다(R8). 확인 전까지는 몰아치지 않는다.
    await new Promise((r2) => setTimeout(r2, 120));
  }

  console.log(`\n시연용 ${rows.length}건 투입 완료 · 세션 ${DEMO_SESSION_ID}`);
  console.log(`지오코딩 실패 ${geocodeFail}건${geocodeFail ? ':' : ''}`);
  for (const a of failed) console.log(`  ✗ ${a}`);
}

await (process.argv.includes('--clean') ? clean() : seed());
