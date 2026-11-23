"use client";

import { useEffect } from "react";

/**
 * A link to #job-tasks (or any anchor) inside a closed job section would land
 * on nothing. Open the sections that hold the target, then scroll to it
 * (TASK-239). Renders nothing.
 */
export function openSectionsFor(target: Element | null): boolean {
  if (!target) return false;
  let opened = false;
  for (let el = target.parentElement; el; el = el.parentElement) {
    if (el instanceof HTMLDetailsElement && !el.open) {
      el.open = true;
      opened = true;
    }
  }
  return opened;
}

export function OpenSectionForHash() {
  useEffect(() => {
    const reveal = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      if (openSectionsFor(target)) target?.scrollIntoView({ block: "start" });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return null;
}
