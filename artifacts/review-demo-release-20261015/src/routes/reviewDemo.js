const router = require('express').Router();
router.post('/', require('../utils/reviewDemo').createReviewDemo({
  connection: require('mongoose').connection,
  models: Object.fromEntries(Object.entries({ Tenant: 'Tenant', User: 'User', Credential: 'ReviewCredential',
    Attempt: 'ReviewLoginAttempt', Session: 'LoginSession', Record: 'HealthRecord',
    Report: 'MedicalReport', Message: 'Message', Admin: 'Admin' }).map(([key, model]) => [key, require('../models/' + model)])),
}));
module.exports = router;
