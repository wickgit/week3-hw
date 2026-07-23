import 'dotenv/config';

import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;

const app = await createApp();
app.listen(port, () => {
  console.log(`Education CRM API listening on http://localhost:${port}`);
});
