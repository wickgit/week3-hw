import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db.js';
import { assertExists, foreignKey, idParam } from '../lib/resources.js';
import { validateBody, validateParams, validateQuery } from '../lib/validate.js';

const router = Router();

const listQuery = z.object({
  school_id: foreignKey.optional(),
  q: z.string().trim().min(1).optional(),
});

const createBody = z.object({
  school_id: foreignKey,
  title: z.string().trim().min(1),
  subject: z.string().trim().min(1).optional(),
  credits: z.coerce.number().int().min(0).default(0),
});

router.get('/', validateQuery(listQuery), async (req, res) => {
  const { school_id, q } = req.validated.query;

  const query = db('courses').select('*').orderBy('id');
  if (school_id) query.where({ school_id });
  if (q) {
    query.where((builder) =>
      builder.whereILike('title', `%${q}%`).orWhereILike('subject', `%${q}%`),
    );
  }

  res.json({ data: await query });
});

router.get('/:id', validateParams(idParam), async (req, res) => {
  const course = await assertExists('courses', req.validated.params.id, 'Course');
  res.json({ data: course });
});

router.post('/', validateBody(createBody), async (req, res) => {
  const body = req.validated.body;
  await assertExists('schools', body.school_id, 'School');

  const [course] = await db('courses').insert(body).returning('*');
  res.status(201).json({ data: course });
});

export default router;
