// Shared signup logic: validation, email composition, and delivery.
//
// Both entry points use this module so the two cannot drift:
//   server.js      — local dev, also serves index.html
//   api/signup.js  — Vercel serverless function, production
//
// Delivery tries Resend first (one HTTPS call, no SMTP handshake, so it suits a
// cold-starting serverless function) and falls back to Gmail over SMTP. Either
// alone is enough; configure both and a Resend outage stops losing signups.

const MAX = { name: 120, email: 200, phone: 40, role: 60, message: 2000 };

/** Collapse anything bound for a mail header onto one line.
 *  A newline in `name` would otherwise let a submitter inject headers via the
 *  Subject, which is how you end up relaying someone else's spam. */
const headerSafe = (s, limit) =>
  String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, limit);

const escapeHtml = (s) =>
  String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise the raw request body into the fields we actually send. */
export function normalise(body = {}) {
  return {
    name:    headerSafe(body.name,  MAX.name),
    email:   headerSafe(body.email, MAX.email),
    phone:   headerSafe(body.phone, MAX.phone),
    role:    headerSafe(body.role,  MAX.role),
    fulfill: Boolean(body.fulfill),
    message: String(body.message ?? '').trim().slice(0, MAX.message),
  };
}

/** @returns {string|null} an error message, or null when the payload is good. */
export function validate({ name, email }) {
  if (!name)                return 'Name and email are required.';
  if (!email)               return 'Name and email are required.';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address.';
  return null;
}

export function buildEmail(data) {
  const rows = [
    ['Name',  data.name],
    ['Email', data.email],
    ['Phone', data.phone || '—'],
    ['Role',  data.role  || '—'],
    ['Wants to fulfill more shipments as a forwarder', data.fulfill ? 'Yes' : 'No'],
  ];
  if (data.message) rows.push(['Message', data.message]);

  return {
    subject: `Early access — ${data.name}${data.role ? ` (${data.role})` : ''}`,
    replyTo: data.email,
    text: ['New Ventraa early-access signup', '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n'),
    html: `<h2 style="font-family:sans-serif">New Ventraa early-access signup</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      ${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5A678A">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}
    </table>`,
  };
}

function recipient() {
  return process.env.SIGNUP_TO || process.env.EMAIL_USER || 'rithwik2934@gmail.com';
}

// ── transports ────────────────────────────────────────────────────────────────

async function sendViaResend(mail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { attempted: false };

  // Resend's shared onboarding sender needs no domain verification, but it may
  // only deliver to the address that owns the Resend account.
  const from = process.env.RESEND_FROM || 'Ventraa Signups <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [recipient()],
      reply_to: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { attempted: true };
}

async function sendViaGmail(mail) {
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) return { attempted: false };

  // Imported lazily so the serverless function skips loading nodemailer
  // entirely whenever Resend succeeds.
  const { default: nodemailer } = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  await transporter.sendMail({
    from: `"Ventraa Signups" <${EMAIL_USER}>`,
    to: recipient(),
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return { attempted: true };
}

/** True when at least one transport has credentials available. */
export function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY || (process.env.EMAIL_USER && process.env.EMAIL_PASS));
}

/**
 * Deliver the signup. Tries Resend, then Gmail.
 * @returns {Promise<{via: 'resend'|'gmail'}>}
 * @throws when every configured transport failed (message lists each failure).
 */
export async function deliver(mail) {
  const failures = [];

  for (const [via, send] of [['resend', sendViaResend], ['gmail', sendViaGmail]]) {
    try {
      const { attempted } = await send(mail);
      if (attempted) return { via };
    } catch (err) {
      failures.push(`${via}: ${err.message}`);
    }
  }

  if (!failures.length) throw new Error('No email transport configured.');
  throw new Error(failures.join(' | '));
}

/** Full pipeline. Returns an HTTP status plus the JSON body to send back. */
export async function handleSignup(body) {
  const data = normalise(body);

  const invalid = validate(data);
  if (invalid) return { status: 400, payload: { ok: false, error: invalid } };

  if (!isConfigured()) {
    console.error('✗ No email transport configured. Set RESEND_API_KEY, or EMAIL_USER + EMAIL_PASS.');
    return { status: 500, payload: { ok: false, error: 'Email is not configured on the server.' } };
  }

  try {
    const { via } = await deliver(buildEmail(data));
    console.log(`✓ signup delivered via ${via}: ${data.email}`);
    return { status: 200, payload: { ok: true } };
  } catch (err) {
    console.error('✗ signup delivery failed —', err.message);
    return { status: 502, payload: { ok: false, error: 'Could not send right now. Please try again.' } };
  }
}
