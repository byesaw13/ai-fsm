"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui";
import { DraftReviewPanel } from "./components/DraftReviewPanel";
import type { DraftEstimate } from "@/lib/estimates/ai-draft";
import type { ShoppingList, ExtractedFacts } from "@ai-fsm/domain";
import type { InterviewMessage } from "@ai-fsm/domain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InterviewPhase =
  | "chatting"       // active conversation
  | "generating"     // calling ai-draft
  | "reviewing"      // showing DraftReviewPanel
  | "applied";       // draft applied to form

interface EstimateInterviewFlowProps {
  jobId?: string;
  clientId?: string;
  onApplyDraft: (params: {
    draft: DraftEstimate;
    shoppingList: ShoppingList | null;
  }) => void;
  onSwitchToManual: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EstimateInterviewFlow({
  jobId,
  clientId,
  onApplyDraft,
  onSwitchToManual,
}: EstimateInterviewFlowProps) {
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [phase, setPhase] = useState<InterviewPhase>("chatting");
  const [isWaiting, setIsWaiting] = useState(false);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFacts | null>(null);
  const [structuredDescription, setStructuredDescription] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<DraftEstimate | null>(null);
  const [pendingShoppingList, setPendingShoppingList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measurementsConfirmed, setMeasurementsConfirmed] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Open with the AI's first message
  useEffect(() => {
    const openingMessage: InterviewMessage = {
      role: "assistant",
      content: "Tell me about the work that needs to be done.",
    };
    setMessages([openingMessage]);
    inputRef.current?.focus();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, isWaiting]);

  async function sendMessage(content: string) {
    if (!content.trim() || isWaiting) return;
    setError(null);

    const userMsg: InterviewMessage = { role: "user", content: content.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue("");
    setIsWaiting(true);

    try {
      const res = await fetch("/api/v1/estimates/ai-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          ...(jobId ? { job_id: jobId } : {}),
          ...(clientId ? { client_id: clientId } : {}),
        }),
      });

      const json = await res.json() as {
        reply?: string;
        phase?: "interviewing" | "ready";
        structured_description?: string;
        extracted_facts?: ExtractedFacts;
        error?: { message?: string };
      };

      if (!res.ok) {
        setError(json.error?.message ?? "Something went wrong. Please try again.");
        setIsWaiting(false);
        return;
      }

      const aiMsg: InterviewMessage = {
        role: "assistant",
        content: json.reply ?? "...",
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (json.extracted_facts) setExtractedFacts(json.extracted_facts);

      if (json.phase === "ready" && json.structured_description) {
        setStructuredDescription(json.structured_description);
        setIsWaiting(false);
        // Auto-generate the estimate
        await generateEstimate(json.structured_description);
      } else {
        setIsWaiting(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setIsWaiting(false);
    }
  }

  async function generateEstimate(description: string) {
    setPhase("generating");
    setError(null);

    try {
      const res = await fetch("/api/v1/estimates/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          ...(jobId ? { job_id: jobId } : {}),
        }),
      });

      const json = await res.json() as {
        draft?: DraftEstimate | null;
        shopping_list?: ShoppingList | null;
        error?: { message?: string };
      };

      if (!res.ok || !json.draft || json.draft.services.length === 0) {
        setError("Couldn't generate an estimate from this description. Please add more detail or switch to manual entry.");
        setPhase("chatting");
        return;
      }

      setPendingDraft(json.draft);
      setPendingShoppingList(json.shopping_list ?? null);
      setPhase("reviewing");
    } catch {
      setError("Failed to generate estimate. Please try again.");
      setPhase("chatting");
    }
  }

  function handleApply() {
    if (!pendingDraft) return;
    onApplyDraft({ draft: pendingDraft, shoppingList: pendingShoppingList });
    setPhase("applied");
  }

  function handleRedescribe() {
    setPendingDraft(null);
    setPendingShoppingList(null);
    setPhase("chatting");
    setMeasurementsConfirmed(false);
    // Re-add a prompt to refine
    const continueMsg: InterviewMessage = {
      role: "assistant",
      content: "No problem — what would you like to change or clarify?",
    };
    setMessages((prev) => [...prev, continueMsg]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(inputValue);
    }
  }

  // ── Reviewing state ──────────────────────────────────────────────────────
  if (phase === "reviewing" && pendingDraft) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontWeight: 700 }}>Estimate Draft</h3>
          <button
            type="button"
            onClick={onSwitchToManual}
            style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", background: "none", border: "none", cursor: "pointer" }}
          >
            Switch to manual →
          </button>
        </div>

        <DraftReviewPanel
          draft={pendingDraft}
          shoppingList={pendingShoppingList}
          onApply={handleApply}
          onRedescribe={handleRedescribe}
        />
      </div>
    );
  }

  // ── Generating state ─────────────────────────────────────────────────────
  if (phase === "generating") {
    return (
      <div style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)" }}>
        <p style={{ fontSize: "var(--text-lg)", fontWeight: 600, margin: "0 0 var(--space-2)" }}>
          Generating estimate…
        </p>
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Selecting services, computing materials, and building your shopping list.
        </p>
      </div>
    );
  }

  // ── Chat state ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 520, gap: 0 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: "var(--text-base)" }}>AI Estimate Interview</h3>
          {extractedFacts && (
            <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              {extractedFacts.job_types.join(", ")}
              {extractedFacts.confidence >= 60 && (
                <span style={{ marginLeft: 6, color: "#16a34a" }}>
                  · {extractedFacts.confidence}% ready
                </span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onSwitchToManual}
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--fg-muted)",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            padding: "3px 8px",
          }}
        >
          Manual entry
        </button>
      </div>

      {/* Message thread */}
      <div
        ref={threadRef}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          padding: "var(--space-3)",
          background: "var(--bg-subtle)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          minHeight: 300,
          maxHeight: 420,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "78%",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                background: msg.role === "user" ? "var(--accent)" : "var(--bg-surface)",
                color: msg.role === "user" ? "#fff" : "var(--fg)",
                border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
                fontSize: "var(--text-sm)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isWaiting && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "12px 12px 12px 4px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
              fontSize: "var(--text-sm)",
            }}>
              <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <p style={{ color: "#dc2626", fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
          {error}
        </p>
      )}

      {/* "Ready to generate" prompt */}
      {extractedFacts && extractedFacts.confidence >= 70 && phase === "chatting" && !isWaiting && (
        <div style={{
          marginTop: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
        }}>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "#15803d", fontWeight: 500 }}>
            Ready to generate — or keep refining.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => structuredDescription && void generateEstimate(structuredDescription)}
          >
            Generate Estimate
          </Button>
        </div>
      )}

      {/* Input */}
      <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer… (Enter to send, Shift+Enter for new line)"
          disabled={isWaiting || phase !== "chatting"}
          rows={2}
          style={{
            flex: 1,
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            fontSize: "var(--text-sm)",
            resize: "none",
            lineHeight: 1.5,
            background: isWaiting ? "var(--bg-subtle)" : "var(--bg-surface)",
          }}
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void sendMessage(inputValue)}
          disabled={isWaiting || !inputValue.trim() || phase !== "chatting"}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
