import express from 'express';
import { apiRouter } from '../server/routes.js';

const app = express();

// Enable CORS for all routes (allows preview URLs and custom domains)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-account-token, x-owner-token');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount on both /api and / to handle direct and rewritten routes cleanly on Vercel
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
