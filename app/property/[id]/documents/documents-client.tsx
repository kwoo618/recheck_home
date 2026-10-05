'use client';

import { deleteDocument, saveDocument } from '@/lib/actions/documents';
import { runCompare } from '@/lib/actions/compare';
import { DocumentsScreen } from '@/components/screens/documents-screen';
import type { DiscrepancyDTO, DocumentDTO, PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';
import { parseText } from '@/app/_lib/api-client';

/** 문서 화면의 클라이언트 경계 */
export function DocumentsClient({
  property,
  documents,
  discrepancies,
}: {
  property: PropertyDTO;
  documents: DocumentDTO[];
  discrepancies: DiscrepancyDTO[];
}) {
  return (
    <DocumentsScreen
      property={property}
      documents={documents}
      discrepancies={discrepancies}
      hrefFor={hrefFor}
      onSave={saveDocument}
      onDelete={deleteDocument}
      onParseAd={parseText}
      onCompare={runCompare}
    />
  );
}
