const express = require('express');
const auth = require('../middleware/auth');
const AccountDeletionRequest = require('../models/AccountDeletionRequest');
const { createService } = require('../utils/accountDeletionRequest');
const router = express.Router();
// Requests open only while the deployed worker is checking in successfully.
// Stopping/misconfiguring the worker closes new intake, while receipts still work.
const service = createService({ requests: AccountDeletionRequest,
  isExecutionReady: () => require('../utils/accountDeletionReadiness').workerReady(require('mongoose').connection.db) });
// Receipt lookup is deliberately before auth: the account may already be gone.
// Use POST, not a URL/query token, so the capability is not written into access logs.
const receiptAttempts = new Map();
router.post('/receipt', async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const now = Date.now();
  for (const [key, bucket] of receiptAttempts) if (bucket.until <= now) receiptAttempts.delete(key);
  const key = req.ip;
  const bucket = receiptAttempts.get(key) || { count: 0, until: now + 60000 };
  if (++bucket.count > 30 || (!receiptAttempts.has(key) && receiptAttempts.size >= 10000)) {
    res.set('Retry-After', '60');
    return res.status(429).json({ success: false, message: '请稍后查询' });
  }
  receiptAttempts.set(key, bucket);
  try {
    const { readReceipt } = require('../utils/accountDeletionReceipt');
    const data = await readReceipt({ token: req.body?.receiptToken, secret: process.env.ACCOUNT_DELETION_RECEIPT_SECRET,
      requests: { findOne: q => AccountDeletionRequest.collection.findOne(q), objectId: id => new (require('mongoose').Types.ObjectId)(id) } });
    res.json({ success: true, data });
  } catch (error) { if (error.status) return res.status(error.status).json({ success: false, message: error.message }); next(error); }
});
router.use(auth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// Deliberately outside paid-service expiry checks: privacy rights do not require membership.
router.get('/', async (req, res, next) => {
  try { res.json({ success: true, data: await service.get(req.user) }); }
  catch (error) { if (error.status) return res.status(error.status).json({ success: false, message: error.message }); next(error); }
});
router.post('/', async (req, res, next) => {
  try {
    const data = await service.submit(req.user, req.body);
    res.status(202).json({ success: true, data, message: '注销申请已记录；这不表示账号或数据已经删除。' });
  } catch (error) { if (error.status) return res.status(error.status).json({ success: false, message: error.message }); next(error); }
});
module.exports = router;
