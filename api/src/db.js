import 'dotenv/config';
import knex from 'knex';
import configs from '../knexfile.js';

const environment = configs[process.env.NODE_ENV] ? process.env.NODE_ENV : 'development';

export const db = knex(configs[environment]);
