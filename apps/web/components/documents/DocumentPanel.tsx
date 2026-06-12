"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentLinkRow {
  id: string;
  paperless_doc_id: number;
  title: string | null;
  original_filename: string | null;
  created_at: string;
}

interface PaperlessSearchHit {
  id: number;
  title: string;
  original_file_name: string | null;
}

interface DocumentPanelProps {
  entityType: string;
  entityId: string;
  /** Initial links fetched server-side */
  initialLinks: DocumentLinkRow[];
  /** Whether Paperless integration is configured on the server */
  paperlessEnabled: boolean;
  /** Whether the current user can add/remove links */
  canLink: boolean;
}

// ---------------------------------------------------------------------------
// DocumentPanel
// ---------------------------------------------------------------------------

export function DocumentPanel({
  entityType,
  entityId,
  initialLinks,
  paperlessEnabled,
  canLink,
}: DocumentPanelProps) {
  const [links, setLinks] = useState<DocumentLinkRow[]>(initialLinks);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PaperlessSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Search Paperless ----
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/documents/paperless?q=${encodeURIComponent(searchQuery.trim())}`
      );
      if (!res.ok) {
        setError("Search failed. Paperless may be unavailable.");
        return;
      }
      const data = (await res.json()) as { results: PaperlessSearchHit[] };
      setSearchResults(data.results ?? []);
    } catch {
      setError("Search failed. Check network connectivity.");
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // ---- Link a document ----
  const handleLink = useCallback(
    async (hit: PaperlessSearchHit) => {
      setLinking(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: entityType,
            entity_id: entityId,
            paperless_doc_id: hit.id,
            title: hit.title,
            original_filename: hit.original_file_name,
          }),
        });

        if (res.status === 409) {
          setError("This document is already linked.");
          return;
        }
        if (!res.ok) {
          setError("Failed to link document.");
          return;
        }

        const data = (await res.json()) as { link: DocumentLinkRow };
        setLinks((prev) => [data.link, ...prev]);
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
      } catch {
        setError("Failed to link document. Please try again.");
      } finally {
        setLinking(false);
      }
    },
    [entityType, entityId]
  );

  // ---- Unlink a document ----
  const handleUnlink = useCallback(async (linkId: string) => {
    setUnlinking(linkId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/documents/${linkId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setError("Failed to remove link.");
        return;
      }
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      setError("Failed to remove link. Please try again.");
    } finally {
      setUnlinking(null);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p7-card" style={{ marginTop: "var(--space-4)" }}>
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
          Documents
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
        {canLink && paperlessEnabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowSearch((s) => !s);
              setError(null);
            }}
          >
            {showSearch ? "Cancel" : "+ Link document"}
          </Button>
        )}
      </div>

      {/* Not configured notice */}
      {!paperlessEnabled && (
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--fg-muted)",
            fontStyle: "italic",
            margin: 0,
          }}
        >
          Paperless-ngx is not configured. Set{" "}
          <code>PAPERLESS_URL</code> and{" "}
          <code>PAPERLESS_API_TOKEN</code> to enable document linking.
        </p>
      )}

      {/* Search panel */}
      {showSearch && paperlessEnabled && (
        <div
          style={{
            background: "var(--bg-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <input
              type="text"
              className="p7-input"
              placeholder="Search Paperless documents…"
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
              {searchResults.map((hit) => (
                <li
                  key={hit.id}
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
                      {hit.title || hit.original_file_name || `Document #${hit.id}`}
                    </div>
                    {hit.original_file_name && hit.title !== hit.original_file_name && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {hit.original_file_name}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleLink(hit)}
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
              No documents found.
            </p>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          style={{
            color: "var(--color-error)",
            fontSize: "var(--text-sm)",
            marginBottom: "var(--space-2)",
          }}
        >
          {error}
        </div>
      )}

      {/* Linked documents list */}
      {links.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-sm)",
            color: "var(--fg-muted)",
            fontStyle: "italic",
          }}
        >
          No documents linked.
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
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--font-medium)",
                  }}
                >
                  {link.title || link.original_filename || `Document #${link.paperless_doc_id}`}
                </div>
                {link.original_filename && link.title !== link.original_filename && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                    {link.original_filename}
                  </div>
                )}
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  Paperless #{link.paperless_doc_id} &middot;{" "}
                  {new Date(link.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
              {canLink && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnlink(link.id)}
                  disabled={unlinking === link.id}
                  aria-label={`Remove link to ${link.title ?? `document #${link.paperless_doc_id}`}`}
                >
                  {unlinking === link.id ? "Removing…" : "Remove"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
