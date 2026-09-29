'use client';

import { deleteDocument, saveDocument } from '@/lib/actions/documents';
import { DocumentsScreen } from '@/components/screens/documents-screen';
import type { DocumentDTO, PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';
import { parseText } from '@/app/_lib/api-client';

/** 문서 화면의 클라이언트 경계. 대조(onCompare)는 4단계에서 연결한다 */
export function DocumentsClient({
  property,
  documents,
}: {
  property: PropertyDTO;
  documents: DocumentDTO[];
}) {
  return (
    <DocumentsScreen
      property={property}
      documents={documents}
      hrefFor={hrefFor}
      onSave={saveDocument}
      onDelete={deleteDocument}
      onParseAd={parseText}
    />
  );
}
