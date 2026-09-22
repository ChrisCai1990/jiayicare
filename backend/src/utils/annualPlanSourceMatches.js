function annualPlanSourceMatches(source, template, code, strategy) {
  if (!source) return false;
  if (source.servicePlanCode) return source.servicePlanCode === code;
  if (source.planType === code) return true;
  if (source.planType !== strategy) return false;
  if (source.templateId) return String(source.templateId) === String(template._id);
  return !source.templateName || [template.name, template.content?.planName].includes(source.templateName);
}
module.exports = { annualPlanSourceMatches };
