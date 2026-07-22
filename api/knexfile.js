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
  test: {
    ...shared,
    connection: process.env.TEST_DATABASE_URL,
  },
};
