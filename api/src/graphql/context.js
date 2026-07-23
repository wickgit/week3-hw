import { GraphQLError } from 'graphql';

import { verifyToken } from '../auth/jwt.js';
import { createLoaders } from './loaders.js';

export async function buildContext({ req }) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  let user = null;
  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyToken(token);
      user = { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      user = null;
    }
  }

  return { user, loaders: createLoaders() };
}

export function requireUser(context) {
  if (!context.user) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
    });
  }
  return context.user;
}
