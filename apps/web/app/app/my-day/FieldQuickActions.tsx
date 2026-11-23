import { SectionHeader } from "@/components/ui";
import { NewActionsList } from "@/components/NewActionsList";

const TILE = {
  display: "flex" as const,
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "var(--space-3)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  textDecoration: "none",
  color: "inherit",
  background: "var(--bg-card)",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  textAlign: "center" as const,
  width: "100%",
};

/**
 * Today's New strip: the same choices as the + button (TASK-236), with a
 * receipt pinned to the open job. Owner only — every choice is an owner/admin
 * page, and admins have no Today.
 */
export function FieldQuickActions({
  showNew = false,
  currentJobId = null,
}: {
  showNew?: boolean;
  currentJobId?: string | null;
}) {
  if (!showNew) return null;
  return (
    <section data-testid="field-quick-actions">
      <SectionHeader title="New" as="h3" />
      <div className="my-day-quick-grid" style={{ marginTop: "var(--space-3)" }}>
        <NewActionsList itemStyle={TILE} currentJobId={currentJobId} />
      </div>
    </section>
  );
}
