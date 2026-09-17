import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = process.env.PORT || 5050;
const TO   = process.env.SIGNUP_TO || 'rithwik2934@gmail.com';

// CORS — lets the form POST here even when the page is previewed from
// another origin (e.g. VS Code Live Server on :5500, or file://).
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(__dirname));            // serves index.html + assets

// Gmail transport — needs a Google App Password (see .env.example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const escape = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

app.post('/api/signup', async (req, res) => {
  const {
    name = '', email = '', phone = '', role = '',
    fulfill = false, message = '',
  } = req.body || {};

  // ── validation ──
  if (!name.trim() || !email.trim()) {
    return res.status(400).json({ ok: false, error: 'Name and email are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('✗ Email not configured. Set EMAIL_USER and EMAIL_PASS in .env');
    return res.status(500).json({ ok: false, error: 'Email is not configured on the server.' });
  }

  const rows = [
    ['Name',  name],
    ['Email', email],
    ['Phone', phone || '—'],
    ['Role',  role  || '—'],
    ['Wants to fulfill more shipments as a forwarder', fulfill ? 'Yes' : 'No'],
  ];
  if (message) rows.push(['Message', message]);

  const text = ['New Ventraa early-access signup', '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const html = `<h2 style="font-family:sans-serif">New Ventraa early-access signup</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      ${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A678A">${k}</td><td style="padding:4px 0"><strong>${escape(v)}</strong></td></tr>`).join('')}
    </table>`;

  try {
    await transporter.sendMail({
      from: `"Ventraa Signups" <${process.env.EMAIL_USER}>`,
      to: TO,
      replyTo: email,
      subject: `Early access — ${name}${role ? ` (${role})` : ''}`,
      text,
      html,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('✗ sendMail failed:', err.message);
    res.status(500).json({ ok: false, error: 'Could not send right now. Please try again.' });
  }
});

app.listen(PORT, () => console.log(`Ventraa running → http://localhost:${PORT}`));
