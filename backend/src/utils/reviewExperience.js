const crypto = require('crypto');

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;

function reviewConfig(now = Date.now()) {
  const accountId = String(process.env.REVIEW_LOGIN_USER_ID || '').trim();
  const username = String(process.env.REVIEW_LOGIN_USERNAME || 'review').trim();
  const passwordHash = String(process.env.REVIEW_LOGIN_PASSWORD_SHA256 || '').trim().toLowerCase();
  const expiresAt = Date.parse(process.env.REVIEW_LOGIN_EXPIRES_AT || '');
  return {
    enabled: /^[0-9a-f]{24}$/i.test(accountId) && !!username && /^[0-9a-f]{64}$/.test(passwordHash) && Number.isFinite(expiresAt) && expiresAt > now,
    accountId, username, passwordHash, expiresAt,
  };
}

function canAttempt(ip, now = Date.now()) {
  const key = String(ip || 'unknown');
  const entry = attempts.get(key);
  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    attempts.set(key, { startedAt: now, count: 0 });
    return { allowed: true };
  }
  if (entry.count >= LIMIT) return { allowed: false, retryAfterSeconds: Math.ceil((entry.startedAt + WINDOW_MS - now) / 1000) };
  return { allowed: true };
}

function recordAttempt(ip, now = Date.now()) {
  const key = String(ip || 'unknown');
  const entry = attempts.get(key);
  if (!entry || now - entry.startedAt >= WINDOW_MS) attempts.set(key, { startedAt: now, count: 1 });
  else entry.count += 1;
}

function validCredentials(config, username, password) {
  if (!config.enabled || String(username || '') !== config.username || typeof password !== 'string') return false;
  const submitted = crypto.createHash('sha256').update(password).digest();
  const expected = Buffer.from(config.passwordHash, 'hex');
  return crypto.timingSafeEqual(submitted, expected);
}

module.exports = { reviewConfig, canAttempt, recordAttempt, validCredentials };
