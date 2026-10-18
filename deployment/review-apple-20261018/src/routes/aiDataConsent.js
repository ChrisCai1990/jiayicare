const router = require('express').Router();
const auth = require('../middleware/auth');
const Consent = require('../models/AiDataConsent');
const { VERSION, PURPOSES, disclosure, matches } = require('../utils/aiDataConsent');
router.use(auth);
router.get('/', async (req, res, next) => {
  try {
    const rows = await Consent.find({ user: req.user._id }).lean();
    res.json({ success: true, data: Object.keys(PURPOSES).map(purpose => {
      const d = disclosure(purpose), row = rows.find(x => x.purpose === purpose && x.provider === d.provider);
      return { ...d, subjectId: String(req.user._id), granted: matches(row, purpose, d.provider), revision: row?.revision || 0 };
    }) });
  } catch (e) { next(e); }
});
router.put('/:purpose', async (req, res, next) => {
  try {
    const d = disclosure(req.params.purpose), { granted, version, revision, subjectId } = req.body || {};
    if (subjectId !== String(req.user._id)) return res.status(409).json({ success: false, message: '登录账号已变化，请重新查看授权说明' });
    if (!d || typeof granted !== 'boolean' || version !== VERSION || !Number.isInteger(revision) || revision < 0) return res.status(400).json({ success: false, message: '授权说明已更新，请重新查看后操作' });
    if (granted && !d.available) return res.status(409).json({ success: false, message: '该第三方服务暂不可用' });
    const key = { user: req.user._id, purpose: d.purpose, provider: d.provider };
    // Primary-key fencing also works where production autoIndex is disabled.
    const id = require('crypto').createHash('sha256').update(`${key.user}:${key.purpose}:${key.provider}`).digest('hex').slice(0, 24);
    // Create a non-granted baseline; concurrent create cannot grant permissions.
    try { await Consent.updateOne({ _id: id }, { $setOnInsert: { ...key, version: VERSION, granted: false, revision: 0 } }, { upsert: true }); } catch (e) { if (e.code !== 11000) throw e; }
    const result = await Consent.updateOne({ _id: id, ...key, revision }, {
      $set: { granted, version: VERSION }, $inc: { revision: 1 },
      $push: { events: { granted, version: VERSION, at: new Date(), actor: req.user._id } },
    });
    if (!result.modifiedCount) return res.status(409).json({ success: false, message: '授权状态已变化，请刷新后重试' });
    res.json({ success: true, data: { ...d, granted, revision: revision + 1 } });
  } catch (e) { next(e); }
});
module.exports = router;
