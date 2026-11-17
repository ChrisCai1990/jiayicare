const SystemConfig = require('../models/SystemConfig');
const { reviewConfig, combineReviewAccess } = require('./reviewExperience');

async function reviewAccessState() {
  const credentials = reviewConfig();
  const setting = await SystemConfig.findOne({ key: 'reviewExperience' }).select('value').lean();
  return combineReviewAccess(credentials, setting?.value?.enabled === true);
}

module.exports = { reviewAccessState };
