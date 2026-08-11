const PHONE_COOLDOWN_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const PHONE_LIMIT = 5;
const IP_LIMIT = 20;

const phoneUsage = new Map();
const ipUsage = new Map();

function normalizeIp(ip) {
  return String(ip || 'unknown').replace(/^::ffff:/, '');
}

function currentWindow(entry, now) {
  if (!entry || now - entry.windowStartedAt >= WINDOW_MS) {
    return { windowStartedAt: now, count: 0, lastSentAt: 0 };
  }
  return entry;
}

function pruneExpired(now) {
  for (const [key, entry] of phoneUsage) {
    if (now - entry.windowStartedAt >= WINDOW_MS) phoneUsage.delete(key);
  }
  for (const [key, entry] of ipUsage) {
    if (now - entry.windowStartedAt >= WINDOW_MS) ipUsage.delete(key);
  }
}

function checkSmsRateLimit(phone, ip, now = Date.now()) {
  pruneExpired(now);
  const phoneEntry = currentWindow(phoneUsage.get(phone), now);
  const ipKey = normalizeIp(ip);
  const ipEntry = currentWindow(ipUsage.get(ipKey), now);

  const cooldownLeft = PHONE_COOLDOWN_MS - (now - phoneEntry.lastSentAt);
  if (phoneEntry.lastSentAt && cooldownLeft > 0) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(cooldownLeft / 1000),
      message: '验证码发送过于频繁，请稍后再试',
    };
  }
  if (phoneEntry.count >= PHONE_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((phoneEntry.windowStartedAt + WINDOW_MS - now) / 1000),
      message: '该手机号验证码发送次数已达上限，请稍后再试',
    };
  }
  if (ipEntry.count >= IP_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((ipEntry.windowStartedAt + WINDOW_MS - now) / 1000),
      message: '验证码请求次数已达上限，请稍后再试',
    };
  }
  return { allowed: true };
}

function recordSmsAttempt(phone, ip, now = Date.now()) {
  const phoneEntry = currentWindow(phoneUsage.get(phone), now);
  phoneEntry.count += 1;
  phoneEntry.lastSentAt = now;
  phoneUsage.set(phone, phoneEntry);

  const ipKey = normalizeIp(ip);
  const ipEntry = currentWindow(ipUsage.get(ipKey), now);
  ipEntry.count += 1;
  ipUsage.set(ipKey, ipEntry);
}

function resetSmsRateLimits() {
  phoneUsage.clear();
  ipUsage.clear();
}

module.exports = {
  checkSmsRateLimit,
  recordSmsAttempt,
  resetSmsRateLimits,
};
