const express = require('express');
const jwt = require('jsonwebtoken');
const https = require('https');
const User = require('../models/User');
const GiftRecord = require('../models/GiftRecord');
const VerificationCode = require('../models/VerificationCode');
const SystemConfig = require('../models/SystemConfig');
const { checkSmsRateLimit, recordSmsAttempt } = require('../utils/smsRateLimiter');
const requireUser = require('../middleware/auth');
const { seedUserData } = require('../config/seedData');
const DEMO_PHONE = '13800138000';
const router = express.Router();

router.get('/review-experience/status', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const cfg = await SystemConfig.findOne({ key: 'reviewExperience' }).lean();
  res.json({ success: true, data: { enabled: cfg?.value?.enabled === true } });
});

router.post('/review-experience/login', async (_req, res) => {
  const cfg = await SystemConfig.findOne({ key: 'reviewExperience' }).lean();
  if (cfg?.value?.enabled !== true) return res.status(403).json({ success: false, message: '审核体验暂未开放' });
  let user = await User.findOne({ phone: DEMO_PHONE });
  if (!user) {
    user = await User.create({ phone: DEMO_PHONE, name: '审核体验用户', onboardingCompleted: true, onboardingCompletedAt: new Date() });
    await seedUserData(user._id);
  }
  if (user.isDeleted) return res.status(403).json({ success: false, message: '审核体验账号已停用' });
  const token = jwt.sign({ id: user._id, reviewExperience: true }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const healthFund = await computeHealthFund(user);
  res.json({ success: true, data: { token, user: { ...user.toObject(), healthFund, reviewExperience: true }, isNew: false } });
});

// 计算用户健康基金汇总（与 /user/me 保持一致）
async function computeHealthFund(user) {
  try {
    const giftFundAgg = await GiftRecord.aggregate([
      { $match: { patientId: user._id, giftType: 'fund', status: 'active' } },
      { $group: { _id: '$fundType', total: { $sum: '$fundAmount' } } },
    ]);
    const enterpriseFund = giftFundAgg.find(g => g._id === 'enterprise')?.total || 0;
    const totalBalance = user.healthFundBalance || 0;
    return {
      total:     totalBalance,
      corporate: Math.min(enterpriseFund, totalBalance),
      personal:  Math.max(0, totalBalance - enterpriseFund),
    };
  } catch { return { total: 0, corporate: 0, personal: 0 }; }
}

// 简单 https GET 工具（避免额外依赖）
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

// 阿里云短信发送
async function sendSmsAliyun(phone, code) {
  const Dysmsapi = require('@alicloud/dysmsapi20170525');
  const OpenApi  = require('@alicloud/openapi-client');

  const config = new OpenApi.Config({
    accessKeyId:     process.env.ALIYUN_SMS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_SMS_KEY_SECRET,
    endpoint: 'dysmsapi.aliyuncs.com',
  });

  const client = new Dysmsapi.default(config);
  const request = new Dysmsapi.SendSmsRequest({
    phoneNumbers:  phone,
    signName:      process.env.ALIYUN_SMS_SIGN,
    templateCode:  process.env.ALIYUN_SMS_TEMPLATE,
    templateParam: JSON.stringify({ code }),
  });

  const result = await client.sendSms(request);
  if (result.body.code !== 'OK') {
    throw new Error(`短信发送失败: ${result.body.message}`);
  }
}

// 判断是否启用真实短信（需配置4个环境变量）
function smsEnabled() {
  return !!(
    process.env.ALIYUN_SMS_KEY_ID &&
    process.env.ALIYUN_SMS_KEY_SECRET &&
    process.env.ALIYUN_SMS_SIGN &&
    process.env.ALIYUN_SMS_TEMPLATE
  );
}

// 发送验证码
router.post('/send-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ success: false, message: '请输入正确的手机号' });
  }

  // 演示账号始终用固定验证码
  if (phone === DEMO_PHONE) {
    return res.status(403).json({ success: false, message: '演示账号已停用，请使用本人真实身份登录' });
  }
  const rateLimit = checkSmsRateLimit(phone, req.ip);
  if (!rateLimit.allowed) {
    res.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return res.status(429).json({ success: false, message: rateLimit.message });
  }
  // Count the attempt before contacting the provider so concurrent requests cannot bypass the limit.
  recordSmsAttempt(phone, req.ip);
  const isDemo = false;
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // 持久化到 MongoDB（TTL 索引自动清理过期记录，服务重启不丢失）
  await VerificationCode.findOneAndUpdate(
    { phone },
    { code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    { upsert: true }
  );

  // 真实短信模式
  if (!isDemo && smsEnabled()) {
    try {
      await sendSmsAliyun(phone, code);
    } catch (err) {
      console.error('SMS error:', err.message);
      return res.status(500).json({ success: false, message: '短信发送失败，请稍后重试' });
    }
    return res.json({ success: true, message: '验证码已发送至您的手机' });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(503).json({ success: false, message: '短信服务暂不可用，请稍后重试' });
  }
  res.json({ success: true, message: '开发环境验证码已生成', code });
});

// 验证码登录 / 注册
router.post('/login', async (req, res) => {
  const { phone, code, wxLoginCode } = req.body;
  if (!phone || !code) {
    return res.status(400).json({ success: false, message: '手机号和验证码不能为空' });
  }

  // 验证码校验（从 MongoDB 读取，服务重启后依然有效）
  const stored = await VerificationCode.findOne({ phone });
  if (!stored || stored.code !== code || stored.expiresAt < new Date()) {
    return res.status(400).json({ success: false, message: '验证码错误或已过期' });
  }
  await VerificationCode.deleteOne({ phone }); // 一次性使用

  // 查找用户（新手机号自动创建账号）
  if (phone === DEMO_PHONE) return res.status(403).json({ success: false, message: '演示账号已停用' });
  const isDemo = false;
  let user = await User.findOne({ phone });
  if (user?.isDeleted) return res.status(403).json({ success: false, message: '该会员信息已停用，如需恢复请联系管理员' });
  const isNew = !user; // 修复：在创建前判断，而非硬编码 false

  if (isNew) {
    user = await User.create({ phone });
    // 仅演示账号填充演示数据；真实新用户初始为空数据
    if (isDemo) {
      seedUserData(user._id).catch(console.error);
    }
  }

  // A phone login in the mini program must converge on the same account as wx.login.
  // Otherwise records/benefits stay on the phone user while payment OpenID lands on a second user.
  if (!isDemo && wxLoginCode && process.env.WECHAT_MP_APPID && process.env.WECHAT_MP_SECRET) {
    const sessionData = await httpsGet(`https://api.weixin.qq.com/sns/jscode2session?appid=${process.env.WECHAT_MP_APPID}&secret=${process.env.WECHAT_MP_SECRET}&js_code=${encodeURIComponent(wxLoginCode)}&grant_type=authorization_code`);
    if (!sessionData.errcode && sessionData.openid) {
      const occupied = await User.findOne({ wechatMpOpenid: sessionData.openid, _id: { $ne: user._id } });
      if (occupied?.phone && occupied.phone !== DEMO_PHONE) return res.status(409).json({ success: false, message: '该微信已绑定其他手机号账户，请联系客服合并账户' });
      if (occupied) await User.updateOne({ _id: occupied._id }, { $unset: { wechatMpOpenid: 1 } });
      user = await User.findByIdAndUpdate(user._id, { wechatMpOpenid: sessionData.openid }, { new: true });
    }
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

  const healthFund = await computeHealthFund(user);

  res.json({
    success: true,
    message: isNew ? '注册成功' : '登录成功',
    data: { token, user: { ...user.toObject(), healthFund }, isNew },
  });
});

// ── 微信网页授权登录 ──────────────────────────────────────────────
// POST /auth/wechat  body: { code }
router.post('/wechat', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, message: '缺少 code' });

  const appid  = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_SECRET;

  if (!appid || !secret) {
    return res.status(503).json({ success: false, message: '微信登录暂未配置，请使用手机号登录' });
  }

  try {
    // 1. code → access_token + openid
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appid}&secret=${secret}&code=${code}&grant_type=authorization_code`;
    const tokenData = await httpsGet(tokenUrl);
    if (tokenData.errcode) {
      return res.status(400).json({ success: false, message: `微信授权失败: ${tokenData.errmsg}` });
    }
    const { access_token, openid } = tokenData;

    // 2. 获取用户信息（snsapi_userinfo scope）
    const userUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
    const wxUser = await httpsGet(userUrl);

    // 3. 查找或创建用户（以 openid 为唯一键）
    let user = await User.findOne({ wechatOpenid: openid });
    if (user?.isDeleted) return res.status(403).json({ success: false, message: '该会员信息已停用，如需恢复请联系管理员' });
    const isNew = !user;
    if (!user) {
      user = await User.create({
        wechatOpenid: openid,
        name: wxUser.nickname || '微信用户',
      });
    } else if (wxUser.nickname && !user.name) {
      user = await User.findByIdAndUpdate(user._id, { name: wxUser.nickname }, { new: true });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    });

    const healthFund = await computeHealthFund(user);
    res.json({
      success: true,
      message: isNew ? '微信注册成功' : '登录成功',
      data: { token, user: { ...user.toObject(), healthFund }, isNew },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '微信登录失败', error: err.message });
  }
});

// ── 微信小程序登录 ────────────────────────────────────────────────
// POST /auth/wechat-mp  body: { code, userInfo? }
// 小程序登录流程与网页授权完全不同：前端 wx.login() 拿到临时 code，
// 后端用 code2session 接口换 openid + session_key（无 access_token，无用户信息接口）。
// 小程序 appid 与网页/公众号 appid 不同，因此 openid 也不同，存到独立字段 wechatMpOpenid。
router.post('/wechat-mp', async (req, res) => {
  const { code, userInfo } = req.body;
  if (!code) return res.status(400).json({ success: false, message: '缺少 code' });

  const appid  = process.env.WECHAT_MP_APPID;
  const secret = process.env.WECHAT_MP_SECRET;

  if (!appid || !secret) {
    return res.status(503).json({ success: false, message: '小程序登录暂未配置，请使用手机号登录' });
  }

  try {
    // code → openid + session_key
    const sessionUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const sessionData = await httpsGet(sessionUrl);
    if (sessionData.errcode) {
      console.error('jscode2session error:', sessionData.errcode, sessionData.errmsg);
      return res.status(400).json({ success: false, message: `小程序登录失败: ${sessionData.errmsg}` });
    }
    const { openid } = sessionData;

    // 查找或创建用户（以 wechatMpOpenid 为唯一键）
    let user = await User.findOne({ wechatMpOpenid: openid });
    // 历史版本曾把体验者的 OpenID 绑定到演示账号；首次再次登录时自动释放并建真实新账号。
    if (user?.phone === DEMO_PHONE) {
      await User.updateOne({ _id: user._id }, { $unset: { wechatMpOpenid: 1 } });
      user = null;
    }
    if (user?.isDeleted) return res.status(403).json({ success: false, message: '该会员信息已停用，如需恢复请联系管理员' });
    const isNew = !user;
    if (!user) {
      user = await User.create({
        wechatMpOpenid: openid,
        name: userInfo?.nickName || '微信用户',
      });
    } else if (userInfo?.nickName && !user.name) {
      user = await User.findByIdAndUpdate(user._id, { name: userInfo.nickName }, { new: true });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    });

    const healthFund = await computeHealthFund(user);
    res.json({
      success: true,
      message: isNew ? '微信注册成功' : '登录成功',
      data: { token, user: { ...user.toObject(), healthFund }, isNew },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '小程序登录失败', error: err.message });
  }
});

// Bind the current phone/member account to the WeChat identity used by this mini program.
// This keeps health records, enterprise benefits and payment OpenID on one user account.
router.post('/wechat-mp/bind', requireUser, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, message: '缺少微信登录凭证' });
  try {
    const appid = process.env.WECHAT_MP_APPID;
    const secret = process.env.WECHAT_MP_SECRET;
    const sessionData = await httpsGet(`https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`);
    if (sessionData.errcode || !sessionData.openid) {
      return res.status(400).json({ success: false, message: `微信身份绑定失败：${sessionData.errmsg || sessionData.errcode || '未返回 openid'}` });
    }

    const occupied = await User.findOne({ wechatMpOpenid: sessionData.openid, _id: { $ne: req.user._id } });
    if (occupied?.phone && occupied.phone !== DEMO_PHONE) {
      return res.status(409).json({ success: false, message: '该微信已绑定其他手机号账户，请联系客服合并账户' });
    }
    if (occupied) await User.updateOne({ _id: occupied._id }, { $unset: { wechatMpOpenid: 1 } });
    const user = await User.findByIdAndUpdate(req.user._id, { wechatMpOpenid: sessionData.openid }, { new: true });
    const healthFund = await computeHealthFund(user);
    res.json({ success: true, message: '微信身份绑定成功', data: { ...user.toObject(), healthFund } });
  } catch (err) {
    res.status(500).json({ success: false, message: '微信身份绑定失败', error: err.message });
  }
});

module.exports = router;
