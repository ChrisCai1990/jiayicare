const isRow = row => row?.defaultRole === 'nutritionist' || row?.serviceType === 'nutrition_assessment' || row?.directNutritionAssessment === true;
const isTask = task => (task?.sourceType === 'scheduled' && task?.workflowKey === 'annual_nutrition_assessment' && !!task.sourceAnnualPlanId) || (task?.sourceType === 'professional_assessment' && task?.workflowKey === 'lifestyle_interview');
module.exports = { isRow, isTask };
