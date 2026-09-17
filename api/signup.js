// Vercel serverless function. Vercel mounts files in api/ at /api/<name>, so
// this answers POST /api/signup — exactly where the form in index.html posts
// once it is served from a real domain.
//
// All the logic lives in lib/signup.js, shared with server.js for local dev.

import { handleSignup } from '../lib/signup.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  // Vercel parses a JSON body for us, but a string arrives if the client sends
  // an unexpected Content-Type.
  let body = req.body ?? {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { status, payload } = await handleSignup(body);
  return res.status(status).json(payload);
}
