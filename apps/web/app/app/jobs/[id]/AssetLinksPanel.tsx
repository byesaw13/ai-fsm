"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssetLinkRow {
  id: string;
  homebox_item_id: string;
  cached_name: string | null;
  cached_location: string | null;
  status: "planned" | "on_site" | "returned";
  created_at: string;
}

interface HomeboxItem {
  id: string;
  name: string;
  description: string | null;
  location: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
}

interface ConflictInfo {
  entity_type: string;
  entity_id: string;
}

interface HomeboxTag {
  id: string;
  name: string;
}

interface AssetLinksPanelProps {
  entityType: "job" | "visit";
  entityId: string;
  initialLinks: AssetLinkRow[];
  homeboxEnabled: boolean;
  canLink: boolean;
}

const STATUS_LABELS: Record<AssetLinkRow["status"], string> = {
  planned: "Planned",
  on_site: "On Site",
  returned: "Returned",
};

const STATUS_NEXT: Record<AssetLinkRow["status"], AssetLinkRow["status"]> = {
  planned: "on_site",
  on_site: "returned",
  returned: "planned",
};

const STATUS_COLORS: Record<AssetLinkRow["status"], string> = {
  planned: "var(--fg-muted)",
  on_site: "var(--color-success, #16a34a)",
  returned: "var(--color-primary)",
};

// ---------------------------------------------------------------------------
// AssetLinksPanel
// ---------------------------------------------------------------------------

export function AssetLinksPanel({
  entityType,
  entityId,
  initialLinks,
  homeboxEnabled,
  canLink,
}: AssetLinksPanelProps) {
  const [links, setLinks] = useState<AssetLinkRow[]>(initialLinks);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [tags, setTags] = useState<HomeboxTag[]>([]);
  const [searchResults, setSearchResults] = useState<HomeboxItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Load tags once when search panel opens
  useEffect(() => {
    if (!showSearch || !homeboxEnabled || tags.length > 0) return;
    fetch("/api/v1/assets/homebox?tags_only=1")
      .then((r) => r.ok ? r.json() : { tags: [] })
      .then((d: { tags: HomeboxTag[] }) => setTags(d.tags ?? []))
      .catch(() => {});
  }, [showSearch, homeboxEnabled, tags.length]);

  // ---- Search Homebox ----
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: searchQuery.trim() });
      if (selectedTag) params.set("tag", selectedTag);
      const res = await fetch(`/api/v1/assets/homebox?${params}`);
      if (!res.ok) {
        setError("Search failed. Homebox may be unavailable.");
        return;
      }
      const data = (await res.json()) as { results: HomeboxItem[] };
      setSearchResults(data.results ?? []);
    } catch {
      setError("Search failed. Check network connectivity.");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, selectedTag]);

  // ---- Link an asset ----
  const handleLink = useCallback(
    async (item: HomeboxItem) => {
      setLinking(true);
      setError(null);
      setWarnings([]);
      try {
        const res = await fetch("/api/v1/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: entityType,
            entity_id: entityId,
            homebox_item_id: item.id,
            cached_name: item.name,
            cached_location: item.location?.name ?? null,
          }),
        });

        if (res.status === 409) {
          setError("This asset is already linked to this record.");
          return;
        }
        if (!res.ok) {
          setError("Failed to link asset.");
          return;
        }

        const data = (await res.json()) as { link: AssetLinkRow; conflicts: ConflictInfo[] };
        setLinks((prev) => [...prev, data.link]);

        if (data.conflicts && data.conflicts.length > 0) {
          setWarnings([
            `Note: this asset is also linked to ${data.conflicts.length} other open ${data.conflicts[0].entity_type}(s).`,
          ]);
        }

        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
      } catch {
        setError("Failed to link asset. Please try again.");
      } finally {
        setLinking(false);
      }
    },
    [entityType, entityId]
  );

  // ---- Update status ----
  const handleStatusCycle = useCallback(async (link: AssetLinkRow) => {
    const next = STATUS_NEXT[link.status];
    setUpdating(link.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/assets/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setError("Failed to update status.");
        return;
      }
      const data = (await res.json()) as { link: AssetLinkRow };
      setLinks((prev) => prev.map((l) => (l.id === link.id ? data.link : l)));
    } catch {
      setError("Failed to update status.");
    } finally {
      setUpdating(null);
    }
  }, []);

  // ---- Remove link ----
  const handleUnlink = useCallback(async (linkId: string) => {
    setUnlinking(linkId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/assets/${linkId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setError("Failed to remove asset link.");
        return;
      }
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      setError("Failed to remove asset link.");
    } finally {
      setUnlinking(null);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p7-card" style={{ marginTop: "var(--space-4)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-3)",
        }}
      >
        <div
          style={{
            fontWeight: "var(--font-semibold)",
            fontSize: "var(--text-sm)",
            color: "var(--fg-muted)",
          }}
        >
          Assets
          {links.length > 0 && (
            <span
              style={{
                marginLeft: "var(--space-2)",
                background: "var(--color-primary)",
                color: "#fff",
                borderRadius: "999px",
                fontSize: "var(--text-xs)",
                padding: "0 var(--space-2)",
              }}
            >
              {links.length}
            </span>
          )}
        </div>
        {canLink && homeboxEnabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowSearch((s) => !s);
              setError(null);
              setWarnings([]);
            }}
          >
            {showSearch ? "Cancel" : "+ Link asset"}
          </Button>
        )}
      </div>

      {/* Not configured notice */}
      {!homeboxEnabled && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", fontStyle: "italic", margin: 0 }}>
          Homebox is not configured. Set <code>HOMEBOX_URL</code>, <code>HOMEBOX_USER</code>, and{" "}
          <code>HOMEBOX_PASSWORD</code> to enable asset linking.
        </p>
      )}

      {/* Search panel */}
      {showSearch && homeboxEnabled && (
        <div
          style={{
            background: "var(--bg-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          {tags.length > 0 && (
            <div style={{ marginBottom: "var(--space-2)" }}>
              <select
                className="p7-input"
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                style={{ width: "100%", fontSize: "var(--text-sm)" }}
              >
                <option value="">All tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <input
              type="text"
              className="p7-input"
              placeholder="Search Homebox items…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{ flex: 1, fontSize: "var(--text-sm)" }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
            >
              {searching ? "Searching…" : "Search"}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {searchResults.map((item) => (
                <li
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)" }}>
                      {item.name}
                    </div>
                    {item.location && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {item.location.name}
                      </div>
                    )}
                    {item.tags.length > 0 && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {item.tags.map((t) => t.name).join(", ")}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleLink(item)}
                    disabled={linking}
                  >
                    {linking ? "Linking…" : "Link"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {!searching && searchResults.length === 0 && searchQuery.trim() && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              No items found.
            </p>
          )}
        </div>
      )}

      {/* Warnings (availability conflicts) */}
      {warnings.map((w, i) => (
        <div
          key={i}
          style={{
            color: "var(--color-warning, #d97706)",
            fontSize: "var(--text-sm)",
            marginBottom: "var(--space-2)",
          }}
        >
          ⚠ {w}
        </div>
      ))}

      {/* Error */}
      {error && (
        <div style={{ color: "var(--color-error)", fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
          {error}
        </div>
      )}

      {/* Linked assets list */}
      {links.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", fontStyle: "italic" }}>
          No assets linked.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {links.map((link) => (
            <li
              key={link.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)" }}>
                  {link.cached_name ?? link.homebox_item_id}
                </div>
                {link.cached_location && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                    {link.cached_location}
                  </div>
                )}
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "2px" }}>
                  Linked {new Date(link.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                {canLink && (
                  <button
                    onClick={() => handleStatusCycle(link)}
                    disabled={updating === link.id}
                    title={`Mark as ${STATUS_LABELS[STATUS_NEXT[link.status]]}`}
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: "var(--font-medium)",
                      color: STATUS_COLORS[link.status],
                      background: "none",
                      border: "1px solid currentColor",
                      borderRadius: "var(--radius-sm)",
                      padding: "2px 8px",
                      cursor: "pointer",
                      opacity: updating === link.id ? 0.5 : 1,
                    }}
                  >
                    {updating === link.id ? "…" : STATUS_LABELS[link.status]}
                  </button>
                )}
                {!canLink && (
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: "var(--font-medium)",
                      color: STATUS_COLORS[link.status],
                    }}
                  >
                    {STATUS_LABELS[link.status]}
                  </span>
                )}
                {canLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnlink(link.id)}
                    disabled={unlinking === link.id}
                    aria-label={`Remove ${link.cached_name ?? "asset"}`}
                  >
                    {unlinking === link.id ? "…" : "Remove"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
