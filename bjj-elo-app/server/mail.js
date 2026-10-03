const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
function mailReady() {
  if (process.env.NODE_ENV === 'test' && process.env.MAIL_TRANSPORT === 'file') return true;
  try {
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.EMAIL_DOMAIN_VERIFIED === 'true' && new URL(process.env.APP_ORIGIN).protocol === 'https:');
  } catch { return false; }
}
async function sendAccountEmail(email, kind, token) {
  if (!mailReady()) throw new Error('Email delivery is not configured');
  const origin = process.env.APP_ORIGIN || 'http://localhost:3087';
  const url = `${origin}/#${kind}=${token}`;
  const subject = kind === 'reset' ? 'Reset your Mat Rank password' : 'Verify your Mat Rank email';
  const text = `${subject}\n\n${kind === 'reset' ? 'Choose a new password using this single-use link. It expires in 30 minutes.' : 'Confirm your email to finish the account request you made. This single-use link expires in 24 hours.'}\n\n${url}\n\nIf you did not request this, ignore this email. Do not forward this link. Mat Rank support will never ask for your password.\n\nHelp: badrc124@gmail.com`;
  // Isolated tests only: never expose reset links in logs or HTTP responses.
  if (process.env.NODE_ENV === 'test' && process.env.MAIL_TRANSPORT === 'file') {
    const folder = path.join(process.env.DATA_DIR, 'mail-test');
    await fs.mkdir(folder, {recursive: true});
    await fs.writeFile(path.join(folder, crypto.randomUUID() + '.json'), JSON.stringify({to:email, subject, text}), {mode:0o600});
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: {'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json'},
    body: JSON.stringify({from:process.env.EMAIL_FROM, to:[email], subject, text}),
  });
  if (!response.ok) throw new Error('Email delivery failed');
}
module.exports = {mailReady, sendAccountEmail};
