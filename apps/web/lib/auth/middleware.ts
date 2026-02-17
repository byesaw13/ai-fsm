import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./session";
import { hasRole } from "./permissions";
import type { Role } from "@ai-fsm/domain";
import { randomUUID } from "crypto";

/**
 * Require authentication - returns session or error response
 */
export async function requireAuth(
  request: NextRequest
): Promise<
  | { success: true; session: { userId: string; accountId: string; role: Role } }
  | { success: false; response: NextResponse }
> {
  const traceId = randomUUID();
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

  return { success: true, session };
}

/**
 * Require specific roles - returns session or forbidden response
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: Role[]
): Promise<
  | { success: true; session: { userId: string; accountId: string; role: Role } }
  | { success: false; response: NextResponse }
> {
  const authResult = await requireAuth(request);

  if (!authResult.success) {
    return authResult;
  }

  const traceId = randomUUID();

  if (!hasRole(authResult.session.role, allowedRoles)) {
    const response = NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: `This action requires one of: ${allowedRoles.join(", ")}`,
          traceId,
        },
      },
      { status: 403 }
    );
    return { success: false, response };
  }

  return authResult;
}

/**
 * Higher-order function to create role-protected route handlers
 * 
 * Usage:
 * export const GET = withRole(["owner", "admin"], async (request, session) => {
 *   // Handler logic here - only runs if role check passes
 *   return NextResponse.json({ data: "protected" });
 * });
 */
export function withRole<
  T extends (request: NextRequest, session: { userId: string; accountId: string; role: Role }) => Promise<NextResponse>
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
 * Higher-order function to create auth-protected route handlers (any role)
 * 
 * Usage:
 * export const GET = withAuth(async (request, session) => {
 *   // Handler logic here - only runs if authenticated
 *   return NextResponse.json({ data: "protected" });
 * });
 */
export function withAuth<
  T extends (request: NextRequest, session: { userId: string; accountId: string; role: Role }) => Promise<NextResponse>
>(handler: T) {
  return async function (request: NextRequest): Promise<NextResponse> {
    const result = await requireAuth(request);

    if (!result.success) {
      return result.response;
    }

    return handler(request, result.session);
  };
}
