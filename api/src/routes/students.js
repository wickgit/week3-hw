import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db.js';
import { assertExists, foreignKey, idParam, isUniqueViolation } from '../lib/resources.js';
import { ApiError } from '../lib/errors.js';
import { validateBody, validateParams, validateQuery } from '../lib/validate.js';

const router = Router();

const listQuery = z.object({
  school_id: foreignKey.optional(),
  q: z.string().trim().min(1).optional(),
});

const createBody = z.object({
  school_id: foreignKey,
  full_name: z.string().trim().min(1),
  email: z.email(),
});

router.get('/', validateQuery(listQuery), async (req, res) => {
  const { school_id, q } = req.validated.query;

  const query = db('students').select('*').orderBy('id');
  if (school_id) query.where({ school_id });
  if (q) {
    query.where((builder) =>
      builder.whereILike('full_name', `%${q}%`).orWhereILike('email', `%${q}%`),
    );
  }

  res.json({ data: await query });
});

// Nested read: the agent uses this to summarise a student after enrolling them.
router.get('/:id', validateParams(idParam), async (req, res) => {
  const { id } = req.validated.params;
  const student = await assertExists('students', id, 'Student');
  const school = await db('schools').where({ id: student.school_id }).first();

  const enrollments = await db('enrollments')
    .join('courses', 'courses.id', 'enrollments.course_id')
    .where('enrollments.student_id', id)
    .orderBy('enrollments.id')
    .select(
      'enrollments.id',
      'enrollments.status',
      'enrollments.grade',
      'enrollments.enrolled_at',
      'courses.id as course_id',
      'courses.title as course_title',
      'courses.subject as course_subject',
      'courses.credits as course_credits',
    );

  res.json({ data: { ...student, school, enrollments } });
});

router.post('/', validateBody(createBody), async (req, res, next) => {
  const body = req.validated.body;
  await assertExists('schools', body.school_id, 'School');

  try {
    const [student] = await db('students').insert(body).returning('*');
    res.status(201).json({ data: student });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return next(
        ApiError.conflict(`Student with email ${body.email} already exists in this school`),
      );
    }
    throw err;
  }
});

export default router;
