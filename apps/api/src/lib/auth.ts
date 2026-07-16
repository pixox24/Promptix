import { SignJWT, jwtVerify } from 'jose';
import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { loadEnv } from '../config/env.js';
import { fail } from './response.js';

export const AUTH_COOKIE = 'promptix_admin_token';

export type AdminJwtPayload = {
  sub: string;
  email: string;
  role: string;
};

function secretKey() {
  return new TextEncoder().encode(loadEnv().JWT_SECRET);
}

export async function signAdminToken(payload: AdminJwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
}

export async function verifyAdminToken(
  token: string,
): Promise<AdminJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== 'string') return null;
    return {
      sub: payload.sub,
      email: payload.email,
      role: typeof payload.role === 'string' ? payload.role : 'editor',
    };
  } catch {
    return null;
  }
}

export function setAuthCookie(c: Context, token: string) {
  const env = loadEnv();
  setCookie(c, AUTH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(c: Context) {
  deleteCookie(c, AUTH_COOKIE, { path: '/' });
}

export type AdminVars = {
  Variables: {
    admin: AdminJwtPayload;
  };
};

export async function requireAdmin(c: Context<AdminVars>, next: Next) {
  const token = getCookie(c, AUTH_COOKIE);
  if (!token) {
    return fail(c, 'UNAUTHORIZED', 'Authentication required', 401);
  }
  const payload = await verifyAdminToken(token);
  if (!payload) {
    return fail(c, 'UNAUTHORIZED', 'Invalid or expired session', 401);
  }
  c.set('admin', payload);
  await next();
}
