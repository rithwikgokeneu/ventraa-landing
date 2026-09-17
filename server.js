// Local development server. Serves index.html and answers the signup endpoint,
// so previewing on :5050 behaves like production.
//
// Production does NOT run this file — Vercel serves index.html statically and
// runs api/signup.js as a serverless function. Both share lib/signup.js.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleSignup } from './lib/signup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = process.env.PORT || 5050;

// CORS — lets the form POST here even when the page is previewed from
// another origin (e.g. VS Code Live Server on :5500, or file://).
// Production is same-origin and does not rely on this.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(__dirname));            // serves index.html + assets

app.post('/api/signup', async (req, res) => {
  const { status, payload } = await handleSignup(req.body);
  res.status(status).json(payload);
});

app.listen(PORT, () => console.log(`Ventraa running → http://localhost:${PORT}`));
