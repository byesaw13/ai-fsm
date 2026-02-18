import type { Role } from "@ai-fsm/domain";

/**
 * Role hierarchy: owner > admin > tech
 * Higher number = more permissions
 */
const roleHierarchy: Record<Role, number> = {
  owner: 3,
  admin: 2,
  tech: 1,
};

/**
 * Check if user role meets minimum required role level
 */
export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Check if user role is one of the allowed roles
 */
export function hasRole(userRole: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole);
}

// ============================================
// Permission checks by feature area
// ============================================

/**
 * Can manage account settings (owner only)
 */
export function canManageAccountSettings(role: Role): boolean {
  return role === "owner";
}

/**
 * Can invite users and manage memberships (owner, admin)
 */
export function canManageUsers(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can create and manage clients (owner, admin)
 */
export function canManageClients(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can create jobs (all roles)
 */
export function canCreateJobs(role: Role): boolean {
  return hasRole(role, ["owner", "admin", "tech"]);
}

/**
 * Can assign techs to jobs/visits (owner, admin)
 */
export function canAssignTechs(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can create estimates (owner, admin)
 */
export function canCreateEstimates(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can send estimates (owner, admin)
 */
export function canSendEstimates(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can convert estimates to invoices (owner, admin)
 */
export function canConvertEstimates(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can create invoices (owner, admin)
 */
export function canCreateInvoices(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can send invoices (owner, admin)
 */
export function canSendInvoices(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can record payments (owner, admin)
 */
export function canRecordPayments(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can view audit log (owner, admin)
 */
export function canViewAuditLog(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can delete records (owner only)
 */
export function canDeleteRecords(role: Role): boolean {
  return role === "owner";
}

/**
 * Can create visits (owner, admin)
 */
export function canCreateVisit(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can assign a tech to a visit (owner, admin)
 */
export function canAssignVisit(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can transition job status (owner, admin)
 */
export function canTransitionJob(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can transition visit status — all roles; tech is limited to assigned visits server-side
 */
export function canTransitionVisit(role: Role): boolean {
  return hasRole(role, ["owner", "admin", "tech"]);
}

/**
 * Can update visit notes — all roles; tech limited to assigned visits server-side
 */
export function canUpdateVisitNotes(role: Role): boolean {
  return hasRole(role, ["owner", "admin", "tech"]);
}

/**
 * Can view all jobs — owner/admin see all; tech sees assigned jobs only (query filtered)
 */
export function canViewAllJobs(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}

/**
 * Can view all visits — owner/admin see all; tech sees assigned visits only (query filtered)
 */
export function canViewAllVisits(role: Role): boolean {
  return hasRole(role, ["owner", "admin"]);
}
