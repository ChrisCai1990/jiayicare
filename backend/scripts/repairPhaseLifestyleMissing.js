// Dry run by default. Run with --apply only after reviewing the printed scope.
require('dotenv').config();
const mongoose = require('mongoose');
const PhaseAssessment = require('../src/models/PhaseAssessment');
const HealthRecord = require('../src/models/HealthRecord');
const { correctMissingLifestyle } = require('../src/utils/phaseLifestyleCorrection');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 缺失');
  const apply = process.argv.includes('--apply');
  const period = process.argv.find(arg => arg.startsWith('--period='))?.slice('--period='.length);
  if (apply && !/^\d{4}-\d{2}$/.test(period || '')) throw new Error('正式修订必须指定已核对的 --period=YYYY-MM');
  await mongoose.connect(process.env.MONGODB_URI);
  const reviews = await PhaseAssessment.find({
    assessmentMode: 'routine', periodKey: period || /^\d{4}-\d{2}$/,
    status: 'team_review', content: /本期暂无记录/,
  }).select('patientId periodKey status content teamReviews auditLog __v').lean();
  const result = { scanned: reviews.length, candidates: 0, dimensions: 0, updated: 0, skippedApprovedDoctor: 0, conflicts: 0 };
  for (const review of reviews) {
    const [year, month] = review.periodKey.split('-').map(Number);
    const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`);
    const end = new Date(Date.UTC(year, month, 1) - 8 * 3600000 - 1);
    const records = await HealthRecord.find({ user: review.patientId, recordedAt: { $gte: start, $lte: end }, deletedAt: null })
      .select('type label value unit note recordedAt').sort({ recordedAt: 1 }).lean();
    const correction = correctMissingLifestyle(review.content, records);
    if (!correction.changed.length) continue;
    result.candidates++;
    result.dimensions += correction.changed.length;
    if (review.teamReviews?.familyDoctor?.status === 'approved') { result.skippedApprovedDoctor++; continue; }
    if (!apply) continue;
    const nextTeamReviews = { ...(review.teamReviews || {}) };
    const oldNutritionReview = nextTeamReviews.nutritionist;
    if (oldNutritionReview?.status === 'approved') nextTeamReviews.nutritionist = { status: 'pending' };
    const audit = {
      action: 'evidence_correction', fromStatus: 'team_review', toStatus: 'team_review',
      note: JSON.stringify({ reason: '本期生活方式记录与暂无记录矛盾', dimensions: correction.changed,
        previousContent: review.content, previousNutritionReview: oldNutritionReview?.status === 'approved' ? oldNutritionReview : null }),
      staffName: 'system maintenance', staffRole: 'superadmin', at: new Date(),
    };
    const updated = await PhaseAssessment.updateOne(
      { _id: review._id, __v: review.__v, status: 'team_review', content: review.content },
      { $set: { content: correction.content, teamReviews: nextTeamReviews }, $push: { auditLog: audit }, $inc: { __v: 1 } },
    );
    if (updated.modifiedCount === 1) result.updated++;
    else result.conflicts++;
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
