"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { Role } from "@ai-fsm/domain";
import { filterCommands, type CommandItem } from "@/lib/navigation/command-index";

export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => filterCommands(query, role).slice(0, 12), [query, role]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const go = useCallback(
    (item: CommandItem) => {
      close();
      router.push(item.href as Route);
    },
    [close, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    function onFind() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("dovetails:find", onFind);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("dovetails:find", onFind);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="command-palette-open"
        aria-label="Find what you can do"
        title="Find (Ctrl/⌘ K)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          color: "var(--fg-muted)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Find
        <kbd style={{ fontSize: 11, opacity: 0.7 }}>⌘K</kbd>
      </button>

      {open ? (
        <div
          className="p7-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="What can I do here?"
          data-testid="command-palette"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="p7-modal" style={{ maxWidth: 480, width: "min(480px, 100%)" }}>
            <div className="p7-modal-header">
              <h2 className="p7-modal-title" id="command-palette-title">
                What can I do here?
              </h2>
              <button type="button" className="p7-modal-close" onClick={close} aria-label="Close">
                ×
              </button>
            </div>
            <div className="p7-modal-body">
              <input
                ref={inputRef}
                data-testid="command-palette-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages and actions"
                aria-labelledby="command-palette-title"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 16,
                  marginBottom: 12,
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results[active]) {
                    e.preventDefault();
                    go(results[active]);
                  }
                }}
              />
              {results.length === 0 ? (
                <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                  Nothing matches. Try “invoice”, “My Day”, or “materials”.
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {results.map((item, i) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-testid={i === 0 ? "command-palette-first" : undefined}
                        onClick={() => go(item)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          border: 0,
                          borderRadius: 6,
                          background: i === active ? "var(--accent-subtle)" : "transparent",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        <strong>{item.label}</strong>
                        <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{item.href}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
