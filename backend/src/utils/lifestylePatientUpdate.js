function isLifestylePatientUpdate(body) {
  const keys = Object.keys(body || {});
  return keys.length > 0
    && keys.every(key => ['lifestyle', 'lifestyle_data', '_lifestyleChangeMeta'].includes(key))
    && (!keys.includes('_lifestyleChangeMeta') || keys.includes('lifestyle') || keys.includes('lifestyle_data'));
}

module.exports = { isLifestylePatientUpdate };
