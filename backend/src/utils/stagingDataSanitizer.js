const crypto = require('crypto');

const EXCLUDED_COLLECTIONS = new Set([
  'chatlogs',
  'maintenance_backups',
  'messages',
  'payments',
  'productshares',
  'refunds',
  'sharetokens',
  'temporaryreportuploads',
  'verificationcodes',
]);

const AUTH_OR_CONTACT_KEY = /(?:password|passwd|secret|token|openid|unionid|session|cookie|phone|mobile|email|idcard|idnumber|identitynumber|passport|certificate|address|contactname|contactperson)/i;
const HEALTH_FILE_KEY = /^(?:content|fileurl|fileurls|osskey|osskeys|originalevidence)$/i;
const HEALTH_FILE_COLLECTIONS = new Set([
  'medicalreports',
  'reportextractions',
  'reportrevisions',
  'servicerecords',
]);
const nameMatcherCache = new WeakMap();

function stableAlias(prefix, id, salt) {
  const digest = crypto.createHmac('sha256', salt).update(String(id)).digest('hex').slice(0, 10);
  return `${prefix}-${digest}`;
}

function redactText(value, names = []) {
  let text = String(value);
  text = text
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号已脱敏]')
    .replace(/\b\d{17}[\dXx]\b/g, '[证件号已脱敏]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已脱敏]');
  if (names.length) {
    let matcher = nameMatcherCache.get(names);
    if (!matcher) {
      const aliasByName = new Map();
      for (const entry of names) {
        if (entry?.source && entry.source.length >= 2) aliasByName.set(entry.source, entry.alias);
      }
      const alternatives = [...aliasByName.keys()]
        .sort((a, b) => b.length - a.length)
        .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      matcher = alternatives.length
        ? { regex: new RegExp(alternatives.join('|'), 'g'), aliasByName }
        : null;
      nameMatcherCache.set(names, matcher);
    }
    if (matcher) text = text.replace(matcher.regex, match => matcher.aliasByName.get(match));
  }
  return text;
}

function sanitizeValue(value, context) {
  if (value == null || value instanceof Date || Buffer.isBuffer(value)) return value;
  // Preserve BSON scalar types (ObjectId, Decimal128, Binary, Timestamp) so
  // references and numeric semantics remain valid in the isolated copy.
  if (value && typeof value === 'object' && value._bsontype) return value;
  if (Array.isArray(value)) return value.map(item => sanitizeValue(item, context));
  if (typeof value === 'string') return redactText(value, context.nameReplacements);
  if (typeof value !== 'object') return value;

  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (AUTH_OR_CONTACT_KEY.test(normalizedKey)) {
      continue;
    }
    if (context.stripHealthFiles && HEALTH_FILE_KEY.test(normalizedKey)) {
      continue;
    }
    output[key] = sanitizeValue(nested, context);
  }
  return output;
}

function sanitizeDocument(collectionName, document, options = {}) {
  const salt = String(options.salt || '');
  if (!salt) throw new Error('脱敏盐不能为空');
  const collection = String(collectionName || '').toLowerCase();
  const nameReplacements = Array.isArray(options.nameReplacements) ? options.nameReplacements : [];
  const sanitized = sanitizeValue(document, {
    nameReplacements,
    stripHealthFiles: HEALTH_FILE_COLLECTIONS.has(collection),
  });

  if (collection === 'users') {
    sanitized.name = stableAlias('测试会员', document._id, salt);
    if ('nickname' in sanitized) sanitized.nickname = sanitized.name;
    sanitized.stagingAnonymized = true;
  }
  if (collection === 'admins') {
    const digest = stableAlias('staff', document._id, salt).slice('staff-'.length);
    sanitized.username = `staging_${digest}`;
    sanitized.name = stableAlias('测试医护', document._id, salt);
    sanitized.mustChangePassword = true;
    sanitized.staffStatus = 'inactive';
    sanitized.stagingAnonymized = true;
  }
  if (collection === 'enterprises' && sanitized.name) {
    sanitized.name = stableAlias('测试企业', document._id, salt);
  }
  return sanitized;
}

function collectionCopyPolicy(collectionName) {
  const collection = String(collectionName || '').toLowerCase();
  return EXCLUDED_COLLECTIONS.has(collection) ? 'exclude' : 'sanitize';
}

module.exports = {
  EXCLUDED_COLLECTIONS,
  collectionCopyPolicy,
  redactText,
  sanitizeDocument,
  stableAlias,
};
