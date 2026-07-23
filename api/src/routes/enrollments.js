import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db.js';
import { assertExists, foreignKey, isUniqueViolation } from '../lib/resources.js';
import { ApiError } from '../lib/errors.js';
import { validateBody, validateQuery } from '../lib/validate.js';

const router = Router();

const listQuery = z.object({
  student_id: foreignKey.optional(),
  course_id: foreignKey.optional(),
  status: z.string().trim().min(1).optional(),
});

const createBody = z.object({
  student_id: foreignKey,
  course_id: foreignKey,
  status: z.enum(['active', 'completed', 'dropped']).default('active'),
  grade: z.string().trim().min(1).optional(),
});

router.get('/', validateQuery(listQuery), async (req, res) => {
  const { student_id, course_id, status } = req.validated.query;

  const query = db('enrollments').select('*').orderBy('id');
  if (student_id) query.where({ student_id });
  if (course_id) query.where({ course_id });
  if (status) query.where({ status });

  res.json({ data: await query });
});

router.post('/', validateBody(createBody), async (req, res, next) => {
  const body = req.validated.body;

  const student = await assertExists('students', body.student_id, 'Student');
  const course = await assertExists('courses', body.course_id, 'Course');

  if (student.school_id !== course.school_id) {
    return next(
      ApiError.badRequest('Student and course belong to different schools'),
    );
  }

  try {
    const [enrollment] = await db('enrollments').insert(body).returning('*');
    res.status(201).json({ data: enrollment });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return next(ApiError.conflict('Student is already enrolled in this course'));
    }
    throw err;
  }
});

export default router;
