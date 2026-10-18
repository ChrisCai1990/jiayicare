const router = require('express').Router();
const { createReviewLogin } = require('../utils/reviewAccountAuth');
router.get('/capabilities', require('../middleware/auth'), (req, res) => {
  const services = require('../utils/reviewRuntime').services();
  return require('../utils/reviewCapabilities').createReviewCapabilities({ services })(req, res);
});
router.post('/login', createReviewLogin({
  connection: require('mongoose').connection,
  Credential: require('../models/ReviewCredential'),
  Attempt: require('../models/ReviewLoginAttempt'),
  User: require('../models/User'),
  Session: require('../models/LoginSession'),
}));
router.use('/demo', require('./reviewDemo'));
module.exports = router;
