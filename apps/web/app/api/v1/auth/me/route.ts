import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  account_id: string;
  [key: string]: unknown;
};

export async function GET() {
  const traceId = randomUUID();
  
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
            traceId,
          },
        },
        { status: 401 }
      );
    }

    // Fetch fresh user data
    const user = await queryOne<UserRow>(
      `SELECT id, email, full_name, role, account_id 
       FROM users 
       WHERE id = $1`,
      [session.userId]
    );

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "User not found",
            traceId,
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      account_id: user.account_id,
    });
  } catch (error) {
    console.error("Get user error:", error);
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
