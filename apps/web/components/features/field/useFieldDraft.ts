"use client";

import { useEffect, useRef, useState } from "react";

const DRAFT_LIFETIME_MS = 8 * 60 * 60 * 1000;

/** Tab-local, short-lived edits. Pristine server values are never drafts. */
export function useFieldDraft<T>(key: string | undefined, initial: T) {
  const [value, setValue] = useState(initial);
  const [conflictingDraft, setConflictingDraft] = useState<T | undefined>();
  const [ready, setReady] = useState(false);
  const dirty = useRef(false);
  const baseline = useRef(initial);
  const storageKey = `field-draft:${key}`;

  useEffect(() => {
    if (!key) return;
    baseline.current = initial;
    dirty.current = false;
    setValue(initial);
    setConflictingDraft(undefined);
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (Date.now() - draft.at >= DRAFT_LIFETIME_MS) sessionStorage.removeItem(storageKey);
        else if (JSON.stringify(draft.base) === JSON.stringify(initial)) {
          setValue(draft.value);
          dirty.current = true;
        } else {
          // Keep both versions. The caller offers an explicit restore action.
          setConflictingDraft(draft.value);
        }
      }
    } catch { /* Storage is optional; server saving still works. */ }
    setReady(true);
  }, [key, storageKey, initial]);

  useEffect(() => {
    if (!key || !ready || !dirty.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), base: baseline.current, value }));
    } catch { /* Private browsing may disable storage. */ }
  }, [key, ready, storageKey, value]);

  function update(next: T) {
    dirty.current = true;
    setConflictingDraft(undefined);
    setValue(next);
  }
  function clear() {
    dirty.current = false;
    setConflictingDraft(undefined);
    try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
  }
  return [value, update, clear, conflictingDraft] as const;
}
