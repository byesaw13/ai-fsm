import Link from "next/link";
import { EmptyState, LinkButton, Card, SectionHeader } from "@/components/ui";
import {
  formatPromiseDue,
  promiseEntityHref,
  promiseEntityLabel,
  shouldShowOpenPromises,
  type OpenOwnerPromiseRow,
} from "@/lib/captures/promise-queue";
import type { NeedsAttentionItem } from "@/lib/attention/load-needs-attention";

export function NeedsAttentionPanel({
  items,
  openPromiseRows,
  promisesParam,
}: {
  items: NeedsAttentionItem[];
  openPromiseRows: OpenOwnerPromiseRow[];
  promisesParam?: string;
}) {
  const showPromiseRows = shouldShowOpenPromises(openPromiseRows.length, promisesParam);

  return (
    <Card id="attention" data-testid="needs-attention" style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader title="Needs attention" count={items.length} />
      {items.length === 0 && !showPromiseRows ? (
        <EmptyState title="All clear" description="Nothing needs your attention right now." />
      ) : items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {items.map((item) => (
            <Link key={item.label} href={item.href} className="mobile-work-item">
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <b>{item.count}</b>
            </Link>
          ))}
        </div>
      ) : null}

      {showPromiseRows ? (
        <section
          id="promises"
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-4)" }}
        >
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>Customer Promises</h2>
          {openPromiseRows.length === 0 ? (
            <EmptyState
              title="No open promises"
              description="Captured customer promises show up here after Day Review confirmation."
            />
          ) : (
            openPromiseRows.map((row) => {
              const entityHref = promiseEntityHref(row.entity_type, row.entity_id);
              const entityLabel = promiseEntityLabel(row.entity_type);
              return (
                <div key={row.id} className="mobile-work-item">
                  <span>
                    <strong>{row.title}</strong>
                    <small>
                      {entityLabel} · {row.entity_id} · {formatPromiseDue(row.due_at)}
                    </small>
                  </span>
                  <span style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <LinkButton href={entityHref} variant="secondary" size="sm">
                      Open {entityLabel.toLowerCase()}
                    </LinkButton>
                    <form method="POST" action={`/api/v1/action-items/${row.id}/resolve`}>
                      <button type="submit" className="p7-btn p7-btn-primary p7-btn-sm">
                        Mark done
                      </button>
                    </form>
                  </span>
                </div>
              );
            })
          )}
        </section>
      ) : null}
    </Card>
  );
}
