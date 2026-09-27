const FIELDS = { finding: 300, evidence: 500, recommendation: 300, timeframe: 120, nextStep: 300 };

function normalizeRecommendationInput(body = {}) {
  const result = {};
  for (const [key, max] of Object.entries(FIELDS)) {
    if (body[key] != null && typeof body[key] !== 'string') throw Object.assign(new Error(`${key}必须为文字`), { statusCode: 400 });
    result[key] = String(body[key] || '').trim();
    if (result[key].length > max) throw Object.assign(new Error(`${key}不能超过${max}字`), { statusCode: 400 });
  }
  if (!result.finding || !result.evidence || !result.recommendation) {
    throw Object.assign(new Error('请填写发现的问题、客观依据和服务建议'), { statusCode: 400 });
  }
  return result;
}

module.exports = { normalizeRecommendationInput };
