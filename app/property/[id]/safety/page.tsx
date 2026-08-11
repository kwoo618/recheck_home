import { notFound } from 'next/navigation';
import { getProperty } from '@/lib/actions/properties';
import { SafetyClient } from './safety-client';

/**
 * 계약 전 안전 점검 (PRD §5.7 · §7.7) — 국면 C.
 *
 * 방이 아니라 보증금과 권리를 지키는 단계다.
 * 필수/추천 분류는 lib/rules.ts의 critical 플래그가 정한다 — 분류이지 판정이 아니다.
 */
export default async function SafetyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  return <SafetyClient property={property} />;
}
