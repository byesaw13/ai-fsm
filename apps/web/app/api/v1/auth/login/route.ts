import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { roleSchema } from "@ai-fsm/domain";
import { randomUUID } from "crypto";
import {
  checkRateLimit,
  getClientIp,
  LOGIN_RATE_LIMIT,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email(),
  // Enforce a minimum length here (display-only — real enforcement is bcrypt)
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  account_id: string;
  password_hash: string;
  [key: string]: unknown;
};

export async function POST(request: NextRequest) {
  const traceId = randomUUID();

  // Rate-limit by IP: 5 attempts per 15 minutes. Browser e2e performs many
  // real logins from localhost; unit tests cover exact limiter behavior.
  if (process.env.E2E_DISABLE_LOGIN_RATE_LIMIT !== "1") {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many login attempts. Please try again later.",
            traceId,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.resetAt - Math.floor(Date.now() / 1000)),
            "X-RateLimit-Limit": String(LOGIN_RATE_LIMIT.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rl.resetAt),
          },
        }
      );
    }
  }

  try {
    const body = await request.json();
    const parseResult = loginSchema.safeParse(body);
    
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: { issues: parseResult.error.issues },
            traceId,
          },
        },
        { status: 400 }
      );
    }

    const { email, password } = parseResult.data;

    // Look up user by email. The schema allows the same email in multiple
    // accounts, so fail closed instead of guessing which tenant to log into.
    const matches = await query<UserRow>(
      `SELECT id, email, full_name, role, account_id, password_hash
       FROM users
       WHERE lower(email) = lower($1)
       ORDER BY created_at ASC
       LIMIT 2`,
      [email.toLowerCase().trim()]
    );
    const user = matches[0];

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
            traceId,
          },
        },
        { status: 401 }
      );
    }

    if (matches.length > 1) {
      return NextResponse.json(
        {
          error: {
            code: "AMBIGUOUS_LOGIN",
            message: "This email is connected to more than one account. Ask an owner to make the login email unique.",
            traceId,
          },
        },
        { status: 409 }
      );
    }

    // Verify password
    const passwordValid = await compare(password, user.password_hash);
    if (!passwordValid) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
            traceId,
          },
        },
        { status: 401 }
      );
    }

    // Validate role
    const roleParse = roleSchema.safeParse(user.role);
    if (!roleParse.success) {
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Invalid user role",
            traceId,
          },
        },
        { status: 500 }
      );
    }

    // Create session
    const token = await createSession({
      userId: user.id,
      accountId: user.account_id,
      role: roleParse.data,
    });

    await setSessionCookie(token);

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        account_id: user.account_id,
      },
    });
  } catch (error) {
    logger.error("Login error", error, { traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
          traceId,
        },
      },
      { status: 500 }
    );
  }
}
