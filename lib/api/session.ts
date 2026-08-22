import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getServerConfig } from "@/lib/config";

export type SessionUser = { userId: string; login: string };

type SignedPayload = Record<string, unknown> & { expiresAt: number };

const SESSION_COOKIE = "first_move_session";
const OAUTH_STATE_COOKIE = "first_move_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_STATE_TTL_SECONDS = 60 * 10;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSignedPayload(payload: SignedPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

function decodeSignedPayload<T extends SignedPayload>(value: string, secret: string): T | null {
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;

  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = sign(encoded, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
    return typeof payload.expiresAt === "number" && payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function getCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie");
  if (!cookies) return null;
  for (const part of cookies.split(";")) {
    const [cookieName, ...cookieValue] = part.trim().split("=");
    if (cookieName === name) return decodeURIComponent(cookieValue.join("="));
  }
  return null;
}

function serializeCookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function createSessionCookie(user: SessionUser, secret = getServerConfig().hmacSecret): string {
  const value = encodeSignedPayload({ ...user, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 }, secret);
  return serializeCookie(SESSION_COOKIE, value, SESSION_TTL_SECONDS);
}

export function clearSessionCookie(): string {
  return serializeCookie(SESSION_COOKIE, "", 0);
}

export function createOAuthState(secret = getServerConfig().hmacSecret): { state: string; cookie: string } {
  const state = randomBytes(24).toString("base64url");
  const value = encodeSignedPayload({ state, expiresAt: Date.now() + OAUTH_STATE_TTL_SECONDS * 1000 }, secret);
  return { state, cookie: serializeCookie(OAUTH_STATE_COOKIE, value, OAUTH_STATE_TTL_SECONDS) };
}

export function clearOAuthStateCookie(): string {
  return serializeCookie(OAUTH_STATE_COOKIE, "", 0);
}

export function verifyOAuthState(request: Request, state: string, secret = getServerConfig().hmacSecret): boolean {
  const value = getCookie(request, OAUTH_STATE_COOKIE);
  if (!value) return false;
  const payload = decodeSignedPayload<SignedPayload & { state: string }>(value, secret);
  return payload?.state === state;
}

export async function getSessionUser(request: Request, secret = getServerConfig().hmacSecret): Promise<SessionUser | null> {
  const value = getCookie(request, SESSION_COOKIE);
  if (!value) return null;
  const payload = decodeSignedPayload<SignedPayload & SessionUser>(value, secret);
  if (!payload || typeof payload.userId !== "string" || typeof payload.login !== "string") return null;
  return { userId: payload.userId, login: payload.login };
}
