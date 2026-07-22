import 'dotenv/config';
import knex from 'knex';
import configs from '../knexfile.js';

const environment = process.env.NODE_ENV === 'test' ? 'test' : 'development';

export const db = knex(configs[environment]);
