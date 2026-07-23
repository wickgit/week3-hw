import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import express from 'express';

import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { buildContext } from './context.js';

export async function mountGraphql(app, path = '/graphql') {
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  app.use(path, express.json(), expressMiddleware(server, { context: buildContext }));
  return server;
}
