import { notFound } from 'next/navigation';
import { getProperty } from '@/lib/actions/properties';
import { ConfirmClient } from './confirm-client';

/**
 * 정보 확인·수정 (PRD §5.2) — 사람의 2차 확인.
 * 자동 취득 정보는 틀릴 수 있으므로 전 필드 편집 가능한 이 화면을 반드시 경유한다.
 */
export default async function PropertyConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await getProperty(id);

  // 내 세션 소유가 아니면 getProperty가 null을 준다 — 존재 여부를 드러내지 않는다.
  if (!property) notFound();

  return <ConfirmClient property={property} />;
}
