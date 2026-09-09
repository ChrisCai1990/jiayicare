const express = require('express');
const InsuranceIntegrationEvent = require('../models/InsuranceIntegrationEvent');
const InsuranceServiceCase = require('../models/InsuranceServiceCase');
const { AUTHORIZATION_STATUSES, CLAIM_STATUSES, verifyWebhookSignature } = require('../utils/insuranceConnector');
const router = express.Router();

router.post('/:provider/webhook', async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(provider)) return res.status(400).json({ success: false, message: '保险连接器标识无效' });
  const secret = process.env[`INSURANCE_WEBHOOK_SECRET_${provider.toUpperCase()}`];
  if (!secret) return res.status(503).json({ success: false, message: '保险连接器尚未启用' });
  if (!verifyWebhookSignature(req.rawBody, req.headers['x-insurance-signature'], secret)) return res.status(401).json({ success: false, message: '签名校验失败' });
  const eventId = String(req.body?.eventId || '');
  const eventType = String(req.body?.eventType || '');
  if (!eventId || !eventType) return res.status(400).json({ success: false, message: 'eventId 和 eventType 为必填项' });
  let event;
  try {
    event = await InsuranceIntegrationEvent.create({ provider, eventId, eventType, externalCaseId: req.body.externalCaseId || '', payload: req.body });
  } catch (error) {
    if (error?.code === 11000) return res.json({ success: true, duplicate: true });
    throw error;
  }
  try {
    const serviceCase = req.body.externalCaseId && await InsuranceServiceCase.findOne({ 'integration.provider': provider, 'integration.externalCaseId': req.body.externalCaseId });
    if (!serviceCase) event.status = 'ignored';
    else {
      let handled = false;
      if (eventType === 'authorization.status' && AUTHORIZATION_STATUSES.has(req.body.status)) { serviceCase.authorization.status = req.body.status; handled = true; }
      if (eventType === 'claim.status' && CLAIM_STATUSES.has(req.body.status)) { serviceCase.claim.status = req.body.status; handled = true; }
      if (handled) {
        serviceCase.integration.lastSyncedAt = new Date();
        await serviceCase.save();
        event.status = 'processed';
      } else event.status = 'ignored';
    }
    event.processedAt = new Date();
    await event.save();
    res.json({ success: true });
  } catch (error) {
    event.status = 'failed'; event.error = error.message; await event.save(); throw error;
  }
});

module.exports = router;
