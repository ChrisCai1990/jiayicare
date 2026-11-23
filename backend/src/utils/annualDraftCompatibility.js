function preserveLegacyNutritionInput(moduleData, annualFlow, requestedAdvisorTargets) {
  if (annualFlow || requestedAdvisorTargets || !moduleData?.nutrition_assessment) return moduleData;
  const { advisorTargets, ...nutrition } = moduleData.nutrition_assessment;
  return { ...moduleData, nutrition_assessment: nutrition };
}
module.exports = { preserveLegacyNutritionInput };
