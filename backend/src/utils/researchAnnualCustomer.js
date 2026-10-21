const AnnualPlan = require('../models/AnnualPlan');
const ServicePackage = require('../models/ServicePackage');
const { effectivePackageName } = require('./effectivePackageName');
const { SERVICE_VERSIONS } = require('./annualPlanServiceVersions');

// Research cohort identity may be recorded in the customer tier, an existing
// annual plan, a centrally defined annual service version, or package configuration.
async function isAnnualCustomer(patient, models = {}) {
  if (!patient?._id) return false;
  if (patient.membershipTier === 'annual') return true;
  const plans = models.AnnualPlan || AnnualPlan;
  if (await plans.exists({ patientId: patient._id })) return true;
  const label = String(patient.servicePackage || '').trim();
  if (SERVICE_VERSIONS.some(version => version.label === label)) return true;
  const name = effectivePackageName(patient);
  if (!name) return false;
  const packages = models.ServicePackage || ServicePackage;
  const filter = { name, ...(patient.clientBrand ? { clientBrand: patient.clientBrand } : {}) };
  const pkg = await packages.findOne(filter).select('configuration').lean();
  return pkg?.configuration?.membershipTier === 'annual';
}

module.exports = { isAnnualCustomer };
