import 'dotenv/config';

const shared = {
  client: 'pg',
  migrations: { directory: './migrations' },
  seeds: { directory: './seeds' },
};

export default {
  development: {
    ...shared,
    connection: process.env.DATABASE_URL,
  },
  // The container runs with NODE_ENV=production, and the knex CLI selects its
  // config by NODE_ENV, so migrations need an entry under that name too.
  production: {
    ...shared,
    connection: process.env.DATABASE_URL,
  },
  test: {
    ...shared,
    connection: process.env.TEST_DATABASE_URL,
  },
};
