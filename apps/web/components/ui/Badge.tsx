import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Badge — status pills, priority badges, count chips
// ---------------------------------------------------------------------------

export type StatusVariant =
  | "draft" | "sent" | "approved" | "declined" | "expired"
  | "paid" | "overdue" | "partial" | "void" | "in_progress"
  | "scheduled" | "completed" | "cancelled" | "arrived"
  | "quoted" | "invoiced";

export type PriorityVariant = "urgent" | "high" | "medium" | "low";
export type RoleVariant = "owner" | "admin" | "tech";

interface BadgeBaseProps {
  children: ReactNode;
  className?: string;
}

interface StatusBadgeProps extends BadgeBaseProps {
  variant: StatusVariant;
}

interface PriorityBadgeProps extends BadgeBaseProps {
  variant: PriorityVariant;
}

interface RoleBadgeProps extends BadgeBaseProps {
  variant: RoleVariant;
}

interface CountBadgeProps {
  count?: number;
  children?: ReactNode;
  className?: string;
}

/** Maps a status string to the badge CSS class */
export function getStatusBadgeClass(status: string): string {
  return `p7-badge p7-badge-status-${status}`;
}

/** Maps a priority number (0–4) to a PriorityVariant */
export function priorityNumToVariant(priority: number): PriorityVariant | null {
  if (priority >= 4) return "urgent";
  if (priority === 3) return "high";
  if (priority === 2) return "medium";
  if (priority === 1) return "low";
  return null;
}

/** Maps a priority number to a display label */
export function priorityLabel(priority: number): string {
  if (priority >= 4) return "Urgent";
  if (priority === 3) return "High";
  if (priority === 2) return "Medium";
  if (priority === 1) return "Low";
  return "";
}

/** StatusBadge — renders a colored pill for FSM statuses */
export function StatusBadge({ variant, children, className = "" }: StatusBadgeProps) {
  return (
    <span className={`p7-badge p7-badge-status-${variant} ${className}`}>
      {children}
    </span>
  );
}

/** PriorityBadge — renders a colored pill for job priority levels */
export function PriorityBadge({ variant, children, className = "" }: PriorityBadgeProps) {
  return (
    <span className={`p7-badge p7-badge-priority-${variant} ${className}`}>
      {children}
    </span>
  );
}

/** RoleBadge — renders a colored pill for user roles */
export function RoleBadge({ variant, children, className = "" }: RoleBadgeProps) {
  return (
    <span className={`p7-badge p7-badge-role-${variant} ${className}`}>
      {children}
    </span>
  );
}

/** CountBadge — renders a muted chip with a number count */
export function CountBadge({ count, children, className = "" }: CountBadgeProps) {
  return (
    <span className={`p7-badge p7-badge-count ${className}`}>
      {count !== undefined ? count : children}
    </span>
  );
}

/** Badge — generic badge for arbitrary text */
export function Badge({ children, className = "" }: BadgeBaseProps) {
  return (
    <span className={`p7-badge p7-badge-count ${className}`}>
      {children}
    </span>
  );
}
