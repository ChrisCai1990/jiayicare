const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { isReviewEnvironment, assertReviewConnection } = require('./reviewEnvironment');

// Each visitor receives a new synthetic identity, never the password reviewer's
// shared account. No customer records or production credentials are copied.
function createReviewDemo({ connection, models, env = process.env, now = Date.now }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!isReviewEnvironment(env) || env.REVIEW_DEMO_ENABLED !== 'true') {
      return res.status(403).json({ success: false, message: '演示入口暂未开放' });
    }
    let user, tenant;
    const { Tenant, User, Credential, Attempt, Session, Record, Report, Message, Admin } = models;
    try {
      assertReviewConnection(connection, env);
      if (req.body?.consent !== 'synthetic-demo-v1') {
        return res.status(400).json({ success: false, message: '请先阅读演示说明' });
      }
      const timestamp = now();
      const bucket = Math.floor(timestamp / 3600000);
      const ip = crypto.createHash('sha256').update(String(req.ip || req.socket?.remoteAddress || 'unknown')).digest('hex');
      for (const [key, limit] of [[`demo-global:${bucket}`, 100], [`demo-ip:${ip}:${bucket}`, 20]]) {
        const row = await Attempt.findOneAndUpdate({ _id: key }, {
          $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(timestamp + 7200000) },
        }, { upsert: true, new: true });
        if (row.count > limit) {
          res.set('Retry-After', String(Math.ceil((3600000 - timestamp % 3600000) / 1000)));
          return res.status(429).json({ success: false, message: '演示创建较频繁，请稍后再试' });
        }
      }
      const id = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(timestamp + 86400000);
      tenant = await Tenant.create({ code: `demo-${id}`, name: '合成演示机构', status: 'active',
        websiteHosts: [`demo-${id}.invalid`], note: '独立演示资料，不承接真实服务' });
      user = await User.create({ tenantId: tenant._id, name: '演示体验用户', gender: '未知',
        onboardingCompleted: true, onboardingCompletedAt: new Date(timestamp),
        height: 170, weight: 65, servicePackage: '合成演示体验', serviceExpiry: expiresAt.toISOString().slice(0, 10),
        healthProfile: { recentSymptoms: [], pastHistory: '合成演示资料，不用于诊疗' },
      });
      const assignments = {};
      for (const [role, field, name, channel] of [
        ['familyDoctor', 'assignedFamilyDoctor', '演示健康顾问', 'doctor'],
        ['healthManager', 'assignedHealthManager', '演示健管专员', 'manager'],
        ['healthPlanner', 'assignedHealthPlanner', '演示健康规划师', 'planner'],
        ['nutritionist', 'assignedNutritionist', '演示营养师', 'nutritionist'],
      ]) {
        const staff = await Admin.create({ username: `demo_${id}_${channel}`, password: crypto.randomBytes(40).toString('hex'),
          name, title: '合成演示角色', role, tenantId: tenant._id, staffStatus: 'active' });
        assignments[field] = staff._id;
        await Message.create({ user: user._id, type: channel, sender: '预置演示样例', title: '演示会话说明', unread: true,
          conversationId: `${user._id}_${channel}`,
          content: '这是预置合成样例，不是AI实际回复。可以发送合成测试文字；使用AI前会单独征求授权，没有真人值守。请勿发送真实健康资料。' });
      }
      Object.assign(user, assignments);
      await user.save();
      await Record.insertMany([65.4, 65.2, 65.1, 65].map((value, i) => ({ user: user._id, tenantId: tenant._id,
        category: 'metabolism', type: 'weight', label: '体重', value: String(value), unit: 'kg',
        recordedAt: new Date(timestamp - (3 - i) * 86400000), note: '合成演示记录，不是真实健康数据',
        importBatchId: `demo-${id}`, recordedBy: { source: 'system' } })));
      await Report.create({ user: user._id, tenantId: tenant._id, title: '合成测试报告（非医疗文件）',
        date: '2026-10-05', checkDate: '2026-10-05', reportYear: 2026, pages: 1,
        fileUrl: '/api/uploads/review-sample-report.png', fileUrls: ['/api/uploads/review-sample-report.png'],
        mimeType: 'image/png', status: 'pending', audit_status: 'unaudited', note: '预置合成资料，未经过医疗审核。' });
      const credential = await Credential.create({ username: `demo_${id}`, user: user._id, expiresAt,
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12) });
      const sessionId = crypto.randomUUID();
      await Session.create({ user: user._id, sessionId, method: 'review_demo', loginAt: new Date(timestamp) });
      const token = jwt.sign({ id: String(user._id), sessionId, persistent: true,
        reviewAccount: String(credential._id), reviewVersion: credential.version,
      }, env.JWT_SECRET, { expiresIn: 86400, issuer: 'jiayicare-review', audience: 'jiayicare-review' });
      return res.json({ success: true, data: { token, user: user.toObject(), environment: 'isolated-review', expiresAt } });
    } catch {
      // A failed seed must not leave an accessible half-initialized identity.
      if (user) await Promise.allSettled([Credential, Session, Record, Report, Message].map(M => M.deleteMany({ user: user._id })));
      if (user) await User.deleteOne({ _id: user._id }).catch(() => {});
      if (tenant) {
        await Admin.deleteMany({ tenantId: tenant._id }).catch(() => {});
        await Tenant.deleteOne({ _id: tenant._id }).catch(() => {});
      }
      return res.status(503).json({ success: false, message: '演示资料创建失败，请稍后重试' });
    }
  };
}
module.exports = { createReviewDemo };
