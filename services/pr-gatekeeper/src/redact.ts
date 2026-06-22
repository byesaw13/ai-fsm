/**
 * Best-effort secret redaction for any command output surfaced to the MCP
 * client. This is a safety net, not a guarantee — the gatekeeper also avoids
 * printing environment variables and never echoes `.env` contents.
 */

const RULES: Array<{ pattern: RegExp; replace: string }> = [
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_) and fine-grained PATs
  { pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g, replace: "[REDACTED_GH_TOKEN]" },
  { pattern: /github_pat_[A-Za-z0-9_]{20,}/g, replace: "[REDACTED_GH_PAT]" },
  // AWS access key ids
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replace: "[REDACTED_AWS_KEY]" },
  // Bearer tokens
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}/gi, replace: "Bearer [REDACTED]" },
];

/** Redaction rules that keep a leading capture group and mask the rest. */
const GROUP_RULES: Array<{ pattern: RegExp; keep: string }> = [
  // postgres://user:password@host -> keep up to the colon before the password
  { pattern: /(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+(@)/gi, keep: "$1[REDACTED]$2" },
  // KEY=value / KEY: value where the key name looks sensitive
  {
    pattern: /([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|KEY)[A-Za-z0-9_]*\s*[=:]\s*)\S+/gi,
    keep: "$1[REDACTED]",
  },
];

export function redact(input: string): string {
  let out = input;
  for (const { pattern, replace } of RULES) out = out.replace(pattern, replace);
  for (const { pattern, keep } of GROUP_RULES) out = out.replace(pattern, keep);
  return out;
}

/** Redact then keep only the last `maxLines` lines (for compact summaries). */
export function redactTail(input: string, maxLines = 20): string {
  const lines = redact(input).trimEnd().split("\n");
  if (lines.length <= maxLines) return lines.join("\n");
  return ["…(truncated)…", ...lines.slice(-maxLines)].join("\n");
}
