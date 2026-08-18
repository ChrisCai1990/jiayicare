const PRODUCTION_ORIGINS = [
  'https://jiaycare.com',
  'https://admin.jiaycare.com',
  'https://staff.jiaycare.com',
];

const STAGING_ORIGINS = [
  'https://staging.jiaycare.com',
  'https://staging-jinyisen.jiaycare.com',
  'https://staging-admin.jiaycare.com',
  'https://staging-staff.jiaycare.com',
  'https://staging-api.jiaycare.com',
];

const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
];

function buildAllowedOrigins(deploymentEnv = '') {
  const origins = [...PRODUCTION_ORIGINS, ...LOCAL_ORIGINS];
  if (String(deploymentEnv).trim().toLowerCase() === 'staging') origins.push(...STAGING_ORIGINS);
  return origins;
}

function createCorsOriginValidator(deploymentEnv = '') {
  const allowedOrigins = new Set(buildAllowedOrigins(deploymentEnv));
  return (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error(`CORS: origin ${origin} not allowed`);
    error.status = 403;
    return callback(error);
  };
}

module.exports = { buildAllowedOrigins, createCorsOriginValidator };
