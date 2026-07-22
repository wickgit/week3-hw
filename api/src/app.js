import express from 'express';

import authRoutes from './routes/auth.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/auth', authRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
