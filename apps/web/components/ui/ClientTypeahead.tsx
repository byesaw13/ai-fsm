"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Client {
  id: string;
  name: string;
}

interface ClientTypeaheadProps {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
}

export function ClientTypeahead({
  clients,
  value,
  onChange,
  disabled = false,
  placeholder = "Search client...",
  error,
}: ClientTypeaheadProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedClient = clients.find((c) => c.id === value);

  const matches = query.length > 0
    ? clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : clients.slice(0, 8);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const selectClient = useCallback((client: Client) => {
    onChange(client.id);
    setQuery(client.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    setHighlightedIndex(-1);
    if (!val.trim()) onChange("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => Math.min(prev + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < matches.length) {
      e.preventDefault();
      selectClient(matches[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  useEffect(() => {
    if (selectedClient && !query) {
      setQuery(selectedClient.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        className="p7-input"
        value={selectedClient ? selectedClient.name : query}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        style={error ? { borderColor: "var(--color-danger)" } : undefined}
      />
      {isOpen && matches.length > 0 && !selectedClient && (
        <ul
          ref={listRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            margin: "4px 0 0",
            padding: 0,
            listStyle: "none",
            background: "var(--color-surface-overlay)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 50,
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          {matches.map((client, i) => (
            <li
              key={client.id}
              role="option"
              aria-selected={i === highlightedIndex}
              onClick={() => selectClient(client)}
              onMouseEnter={() => setHighlightedIndex(i)}
              style={{
                padding: "var(--space-2) var(--space-3)",
                cursor: "pointer",
                fontSize: "var(--text-sm)",
                background: i === highlightedIndex ? "var(--color-primary-alpha)" : "transparent",
                color: i === highlightedIndex ? "var(--color-primary)" : "var(--fg-primary)",
              }}
            >
              {client.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
