import express from 'express';

import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import enrollmentRoutes from './routes/enrollments.js';
import schoolRoutes from './routes/schools.js';
import studentRoutes from './routes/students.js';
import { requireAuth } from './auth/middleware.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { mountGraphql } from './graphql/index.js';

export async function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/auth', authRoutes);

  app.use('/schools', requireAuth, schoolRoutes);
  app.use('/courses', requireAuth, courseRoutes);
  app.use('/students', requireAuth, studentRoutes);
  app.use('/enrollments', requireAuth, enrollmentRoutes);

  // GraphQL is mounted before the REST 404/error handlers so those do not
  // swallow /graphql requests.
  await mountGraphql(app, '/graphql');

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
