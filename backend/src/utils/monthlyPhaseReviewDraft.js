const { buildStageAssessmentContext } = require('./aiCaseReviewContext');
const { assessment, render } = require('./phaseGoalAssessment');
async function buildMonthlyPhaseReviewDraft(user, window) {
  const days = Math.max(1,Math.ceil((new Date(window.end)-new Date(window.start))/86400000));
  const context = await buildStageAssessmentContext(user,days,window);
  return {content:render(assessment(context)),sources:context.sources};
}
module.exports={buildMonthlyPhaseReviewDraft};
