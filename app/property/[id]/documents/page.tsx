import { notFound } from 'next/navigation';
import { getProperty } from '@/lib/actions/properties';
import { listDocuments } from '@/lib/actions/documents';
import { withoutAddressDetail } from '@/app/_lib/property';
import { DocumentsClient } from './documents-client';

/**
 * 문서 올리기·확인 (V2-PLAN §4-1 · §4-3) — 등기부·광고·계약서.
 *
 * 서버가 주는 것은 저장된 **필드**뿐이다. 원본은 기기(IndexedDB)에만 있어 화면이 직접 찾는다 (R9).
 * 매물 상세주소는 이 화면에 필요 없으므로 지워서 넘긴다 (R7). 문서의 address_detail 칸은
 * 사용자가 직접 확인·편집하는 값이라 그대로 넘긴다.
 */
export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  const documents = await listDocuments(id);

  return <DocumentsClient property={withoutAddressDetail(property)} documents={documents} />;
}
