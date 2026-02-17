import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { queryOne } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { roleSchema } from "@ai-fsm/domain";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

    // Look up user by email
    const user = await queryOne<UserRow>(
      `SELECT id, email, full_name, role, account_id, password_hash 
       FROM users 
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

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
    console.error("Login error:", error);
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
