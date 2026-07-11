"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type KanbanColumn = {
  id: string;
  label: string;
  /** Optional right-side column meta (e.g. column total $) */
  meta?: ReactNode;
};

export type KanbanItemBase = {
  id: string;
  status: string;
};

type StatusKanbanBoardProps<T extends KanbanItemBase> = {
  columns: KanbanColumn[];
  items: T[];
  /** Whether the user may drag (owner/admin). When false, board is read-only. */
  canDrag: boolean;
  /** True if drop from → to is allowed (domain transitions). */
  canDrop: (fromStatus: string, toStatus: string) => boolean;
  /**
   * Persist status change. Return ok:false with message to roll back optimistic UI.
   * Same status is never called.
   */
  onMove: (
    itemId: string,
    fromStatus: string,
    toStatus: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  renderCard: (item: T, ctx: { isDragging: boolean }) => ReactNode;
  /** Show columns that have zero items (needed so empty statuses are drop targets). */
  showEmptyColumns?: boolean;
  testId?: string;
  cardTestId?: string;
  columnWidth?: number;
};

/**
 * Status kanban with native HTML5 drag-and-drop (same approach as ScheduleCalendar).
 * Optimistic move + rollback on API failure. Invalid drops are rejected client-side.
 */
export function StatusKanbanBoard<T extends KanbanItemBase>({
  columns,
  items: itemsProp,
  canDrag,
  canDrop,
  onMove,
  renderCard,
  showEmptyColumns = true,
  testId = "status-kanban",
  cardTestId = "kanban-card",
  columnWidth = 260,
}: StatusKanbanBoardProps<T>) {
  const [items, setItems] = useState(itemsProp);
  const itemsRef = useRef(itemsProp);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    itemsRef.current = itemsProp;
    setItems(itemsProp);
  }, [itemsProp]);

  const byStatus = useMemo(() => {
    const map: Record<string, T[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const item of items) {
      if (map[item.status]) map[item.status].push(item);
      else {
        // Unknown status — still show under a synthetic bucket if needed
        map[item.status] = map[item.status] ?? [];
        map[item.status].push(item);
      }
    }
    return map;
  }, [items, columns]);

  const visibleColumns = showEmptyColumns
    ? columns
    : columns.filter((c) => (byStatus[c.id]?.length ?? 0) > 0);

  const handleDragStart = useCallback(
    (e: React.DragEvent, item: T) => {
      if (!canDrag) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
      e.dataTransfer.setData("application/x-kanban-id", item.id);
      e.dataTransfer.setData("application/x-kanban-status", item.status);
      setDraggingId(item.id);
      setDragFrom(item.status);
      setError(null);
      movedRef.current = false;
    },
    [canDrag],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragFrom(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, status: string) => {
      if (!canDrag || !draggingId || !dragFrom) return;
      if (dragFrom === status) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "none";
        setDropTarget(null);
        return;
      }
      if (!canDrop(dragFrom, status)) {
        e.dataTransfer.dropEffect = "none";
        setDropTarget(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(status);
    },
    [canDrag, canDrop, dragFrom, draggingId],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, toStatus: string) => {
      e.preventDefault();
      const itemId =
        e.dataTransfer.getData("application/x-kanban-id") ||
        e.dataTransfer.getData("text/plain");
      const fromStatus =
        e.dataTransfer.getData("application/x-kanban-status") || dragFrom;
      setDraggingId(null);
      setDragFrom(null);
      setDropTarget(null);
      if (!canDrag || !itemId || !fromStatus || fromStatus === toStatus) return;
      if (!canDrop(fromStatus, toStatus)) {
        setError(`Cannot move from ${fromStatus} to ${toStatus}`);
        return;
      }

      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, status: toStatus } : it)),
      );
      movedRef.current = true;

      const result = await onMove(itemId, fromStatus, toStatus);
      if (!result.ok) {
        setError(result.message ?? "Move failed");
        setItems(itemsRef.current);
      }
    },
    [canDrag, canDrop, dragFrom, onMove],
  );

  if (visibleColumns.length === 0) {
    return (
      <p style={{ color: "var(--fg-muted)", padding: "var(--space-6)" }}>
        Nothing to display.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <div
          role="alert"
          data-testid="kanban-error"
          style={{
            marginBottom: "var(--space-3)",
            padding: "var(--space-2) var(--space-3)",
            background: "var(--color-red-50, #fef2f2)",
            border: "1px solid var(--color-danger, #dc2626)",
            borderRadius: "var(--radius)",
            color: "var(--color-danger, #b91c1c)",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              marginLeft: "var(--space-3)",
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: "var(--text-xs)",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {canDrag && (
        <p
          style={{
            margin: "0 0 var(--space-3)",
            fontSize: "var(--text-xs)",
            color: "var(--fg-muted)",
          }}
        >
          Drag a card onto another column to change status. Only allowed workflow
          moves are accepted.
        </p>
      )}

      <div
        data-testid={testId}
        style={{
          display: "flex",
          gap: "var(--space-4)",
          overflowX: "auto",
          paddingBottom: "var(--space-4)",
          WebkitOverflowScrolling: "touch",
          alignItems: "flex-start",
        }}
      >
        {visibleColumns.map((col) => {
          const colItems = byStatus[col.id] ?? [];
          const isTarget = dropTarget === col.id && draggingId !== null;
          const accepts =
            dragFrom != null && dragFrom !== col.id && canDrop(dragFrom, col.id);
          const columnStyle: CSSProperties = {
            flex: `0 0 ${columnWidth}px`,
            minWidth: columnWidth - 20,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            background: isTarget && accepts ? "rgba(37,99,235,0.06)" : "var(--bg-subtle, var(--bg-card))",
            border: isTarget && accepts
              ? "2px dashed var(--accent)"
              : "1px solid var(--border)",
            borderRadius: "var(--radius-lg, var(--radius))",
            padding: "var(--space-3)",
            minHeight: 120,
            transition: "background 0.1s, border-color 0.1s",
          };

          return (
            <div
              key={col.id}
              data-testid={`board-column-${col.id}`}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              style={columnStyle}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  marginBottom: "var(--space-1)",
                  paddingBottom: "var(--space-2)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: 700,
                    color: "var(--fg)",
                  }}
                >
                  {col.label}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "var(--text-xs)",
                    color: "var(--fg-muted)",
                    fontWeight: 600,
                  }}
                >
                  {colItems.length}
                </span>
                {col.meta}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: 1 }}>
                {colItems.length === 0 ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 72,
                      border: "1px dashed var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--fg-muted)",
                      fontSize: "var(--text-xs)",
                      padding: "var(--space-2)",
                      textAlign: "center",
                    }}
                  >
                    {canDrag ? "Drop here" : `No ${col.label.toLowerCase()}`}
                  </div>
                ) : (
                  colItems.map((item) => {
                    const isDragging = draggingId === item.id;
                    return (
                      <div
                        key={item.id}
                        data-testid={cardTestId}
                        draggable={canDrag}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        style={{
                          cursor: canDrag ? "grab" : "pointer",
                          opacity: isDragging ? 0.4 : 1,
                          transition: "opacity 0.15s",
                        }}
                      >
                        {renderCard(item, { isDragging })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
