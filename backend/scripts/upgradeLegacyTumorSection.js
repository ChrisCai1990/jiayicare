/* Upgrade one existing AI health-summary record from the legacy tumor layout to trend cards. */
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../src/models/User');
const { generateHealthSummarySections } = require('../src/utils/aiHealthSummary');

async function main() {
  const [userId, year = String(new Date().getFullYear()), rawRecordIndex = '0'] = process.argv.slice(2);
  const recordIndex = Number(rawRecordIndex);
  if (!mongoose.isValidObjectId(userId) || !Number.isInteger(recordIndex) || recordIndex < 0) {
    throw new Error('Usage: node backend/scripts/upgradeLegacyTumorSection.js <userId> [year] [recordIndex]');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findById(userId);
  if (!user) throw new Error('Member not found');

  const summary = user.aiHealthSummary || {};
  const entry = summary.byYear?.[String(year)];
  const records = Array.isArray(entry?.records) ? entry.records : [];
  const record = records[recordIndex];
  if (!record?.sections?.tumor_risk) throw new Error('Target AI record or tumor section not found');
  if (Array.isArray(record.sections.tumor_risk.cancers) && record.sections.tumor_risk.cancers.length === 10) {
    console.log('Target tumor section is already structured; no update needed.');
    return;
  }

  const { sections, failed } = await generateHealthSummarySections(user, {
    scope: 'doctor',
    existingSections: record.sections,
    analysisYear: String(year),
    incrementalBase: null,
    reusedTumorSection: null,
  });
  const tumor = sections?.tumor_risk;
  if (failed || !Array.isArray(tumor?.cancers) || tumor.cancers.length !== 10) {
    throw new Error(`Tumor upgrade failed validation: expected 10 cards, received ${tumor?.cancers?.length || 0}`);
  }

  record.sections.tumor_risk = tumor;
  entry.records = records;
  entry.sections = records[0]?.sections || entry.sections;
  summary.byYear[String(year)] = entry;
  if (String(summary.latestYear) === String(year) || !summary.latestYear) summary.sections = entry.sections;
  await User.collection.updateOne({ _id: user._id }, { $set: { aiHealthSummary: summary } });
  console.log(`Upgraded tumor section to ${tumor.cancers.length} cards.`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
