import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import {
  clearAuthCookie,
  requireAdmin,
  setAuthCookie,
  signAdminToken,
  type AdminVars,
} from '../lib/auth.js';
import { verifyPassword } from '../lib/password.js';
import { fail, ok } from '../lib/response.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = new Hono<AdminVars>();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', 'Invalid email or password payload', 400);
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, parsed.data.email.toLowerCase()))
    .limit(1);

  if (!user) {
    return fail(c, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return fail(c, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const token = await signAdminToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  setAuthCookie(c, token);

  return ok(c, {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  });
});

authRoutes.post('/logout', async (c) => {
  clearAuthCookie(c);
  return ok(c, { ok: true });
});

authRoutes.get('/me', requireAdmin, async (c) => {
  const admin = c.get('admin');
  const db = getDb();
  const [user] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      displayName: adminUsers.displayName,
      role: adminUsers.role,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.sub))
    .limit(1);

  if (!user) {
    return fail(c, 'UNAUTHORIZED', 'User not found', 401);
  }
  return ok(c, user);
});
