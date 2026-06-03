import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { roleSchema, type Role } from "@ai-fsm/domain";
import { queryOne } from "../db";
import { getEnv } from "../env";

const COOKIE_NAME = "fsm_session";
const EXPIRY = "7d";

export interface SessionPayload {
  userId: string;
  accountId: string;
  role: Role;
}

type UserSessionRow = {
  id: string;
  account_id: string;
  role: string;
  [key: string]: unknown;
};

function getSecret(): Uint8Array {
  return new TextEncoder().encode(getEnv().AUTH_SECRET);
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const verified = await verifySession(token);
  if (!verified) return null;

  const user = await queryOne<UserSessionRow>(
    `SELECT id, account_id, role FROM users WHERE id = $1`,
    [verified.userId],
  );
  if (!user) return null;

  const role = roleSchema.safeParse(user.role);
  if (!role.success) return null;

  return {
    userId: user.id,
    accountId: user.account_id,
    role: role.data,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES !== "false" && process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
