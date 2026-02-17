import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./session";
import { hasRole } from "./permissions";
import type { Role } from "@ai-fsm/domain";
import { getTraceId } from "../tracing";

export interface AuthSession {
  userId: string;
  accountId: string;
  role: Role;
  traceId: string;
}

/**
 * Require authentication - returns session (with traceId) or error response.
 *
 * A single traceId is extracted/generated once per request and threaded
 * through the session so all downstream operations (audit writes, error
 * responses) share the same correlation ID.
 */
export async function requireAuth(
  request: NextRequest
): Promise<
  | { success: true; session: AuthSession }
  | { success: false; response: NextResponse }
> {
  const traceId = getTraceId(request);
  const session = await getSession();

  if (!session) {
    const response = NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          traceId,
        },
      },
      { status: 401 }
    );
    return { success: false, response };
  }

  return { success: true, session: { ...session, traceId } };
}

/**
 * Require specific roles - returns session (with traceId) or error response.
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: Role[]
): Promise<
  | { success: true; session: AuthSession }
  | { success: false; response: NextResponse }
> {
  const authResult = await requireAuth(request);

  if (!authResult.success) {
    return authResult;
  }

  const { session } = authResult;

  if (!hasRole(session.role, allowedRoles)) {
    const response = NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: `This action requires one of: ${allowedRoles.join(", ")}`,
          traceId: session.traceId,
        },
      },
      { status: 403 }
    );
    return { success: false, response };
  }

  return { success: true, session };
}

/**
 * Higher-order function to create role-protected route handlers.
 *
 * Usage:
 * export const GET = withRole(["owner", "admin"], async (request, session) => {
 *   // session.traceId available for audit writes
 *   return NextResponse.json({ data: "protected" });
 * });
 */
export function withRole<
  T extends (request: NextRequest, session: AuthSession) => Promise<NextResponse>
>(allowedRoles: Role[], handler: T) {
  return async function (request: NextRequest): Promise<NextResponse> {
    const result = await requireRole(request, allowedRoles);

    if (!result.success) {
      return result.response;
    }

    return handler(request, result.session);
  };
}

/**
 * Higher-order function to create auth-protected route handlers (any role).
 *
 * Usage:
 * export const GET = withAuth(async (request, session) => {
 *   // session.traceId available for audit writes
 *   return NextResponse.json({ data: "protected" });
 * });
 */
export function withAuth<
  T extends (request: NextRequest, session: AuthSession) => Promise<NextResponse>
>(handler: T) {
  return async function (request: NextRequest): Promise<NextResponse> {
    const result = await requireAuth(request);

    if (!result.success) {
      return result.response;
    }

    return handler(request, result.session);
  };
}
