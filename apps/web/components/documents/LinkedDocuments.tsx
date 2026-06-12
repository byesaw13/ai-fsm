import type { DocumentLinkEntityType } from "@ai-fsm/domain";
import type { SessionPayload } from "@/lib/auth/session";
import { withDocumentContext, listDocumentLinks } from "@/lib/paperless/db";
import { canLinkDocuments } from "@/lib/auth/permissions";
import { isPaperlessEnabled } from "@/lib/paperless/client";
import { DocumentPanel } from "./DocumentPanel";

interface LinkedDocumentsProps {
  session: SessionPayload;
  entityType: DocumentLinkEntityType;
  entityId: string;
}

/**
 * Server component wrapper for DocumentPanel: fetches the entity's existing
 * Paperless links and resolves permissions, so detail pages only need to
 * render <LinkedDocuments session={session} entityType="job" entityId={id} />.
 */
export async function LinkedDocuments({ session, entityType, entityId }: LinkedDocumentsProps) {
  const initialLinks = await withDocumentContext(session, (client) =>
    listDocumentLinks(client, session.accountId, entityType, entityId)
  );

  return (
    <DocumentPanel
      entityType={entityType}
      entityId={entityId}
      initialLinks={initialLinks}
      paperlessEnabled={isPaperlessEnabled()}
      canLink={canLinkDocuments(session.role)}
    />
  );
}
