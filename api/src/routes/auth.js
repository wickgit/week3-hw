import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { db } from '../db.js';
import { ApiError } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { signToken } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';

const router = Router();

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  const { email, password } = req.validated.body;

  const user = await db('users').where({ email }).first();
  // Same response for unknown email and wrong password, so the endpoint
  // does not reveal which accounts exist.
  const passwordOk = user && (await bcrypt.compare(password, user.password_hash));
  if (!passwordOk) {
    return next(new ApiError(401, 'invalid_credentials', 'Invalid email or password'));
  }

  res.json({
    token: signToken(user),
    user: { id: user.id, email: user.email, role: user.role },
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
