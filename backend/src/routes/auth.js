const express = require('express');
const jwt = require('jsonwebtoken');
const https = require('https');
const crypto = require('crypto');
const User = require('../models/User');
const LoginSession = require('../models/LoginSession');
const HealthFundTransaction = require('../models/HealthFundTransaction');
const VerificationCode = require('../models/VerificationCode');
const SystemConfig = require('../models/SystemConfig');
const { checkSmsRateLimit, recordSmsAttempt } = require('../utils/smsRateLimiter');
const requireUser = require('../middleware/auth');
const { seedUserData } = require('../config/seedData');
const DEMO_PHONE = '13800138000';
const router = express.Router();

router.get('/review-experience/status', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({ success: true, data: { enabled: false } });
});

router.post('/review-experience/login', async (_req, res) => {
  return res.status(403).json({ success: false, message: '游客及审核体验登录已关闭，请使用本人手机号登录' });
});

async function beginLoginSession(req, user, method) {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const device = req.body?.deviceInfo && typeof req.body.deviceInfo === 'object' ? req.body.deviceInfo : {};
  await LoginSession.create({
    user: user._id, sessionId, method, loginAt: now, lastActivityAt: now,
    ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500), device,
  });
  await User.updateOne({ _id: user._id }, {
    $set: { lastLoginAt: now, lastLoginMethod: method },
    $inc: { loginCount: 1 },
  });
  return sessionId;
}

async function grantPromotionFund(userId, amount, remark, source = 'promotion') {
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return;
  const updated = await User.findByIdAndUpdate(userId, { $inc: { healthFundBalance: value } }, { new: true });
  await HealthFundTransaction.create({
    userId, type: 'grant', source, amount: value,
    balanceAfter: updated?.healthFundBalance || 0, remark,
  });
}

async function applyFirstLoginRewards(user, inviteCode) {
  const cfgRow = await SystemConfig.findOne({ key: 'healthFundPolicy' }).lean();
  const cfg = cfgRow?.value || {};
  const now = new Date();
  if (cfg.firstLoginEnabled === true && Number(cfg.firstLoginAmount) > 0) {
    const claimed = await User.findOneAndUpdate(
      { _id: user._id, firstLoginFundGrantedAt: null },
      { $set: { firstLoginFundGrantedAt: now } }, { new: true },
    );
    // 首次登录赠金属于企业健康基金，不是用户自有基金。
    if (claimed) await grantPromotionFund(user._id, cfg.firstLoginAmount, '首次使用小程序健康基金奖励', 'enterprise');
  }
  if (cfg.inviteEnabled !== true || !inviteCode || user.referralRewardGrantedAt) return;
  const inviter = await User.findOne({ referralCode: String(inviteCode), isDeleted: { $ne: true }, _id: { $ne: user._id } }).select('_id');
  if (!inviter) return;
  const claimed = await User.findOneAndUpdate(
    { _id: user._id, referralRewardGrantedAt: null, invitedBy: null },
    { $set: { referralRewardGrantedAt: now, invitedBy: inviter._id } }, { new: true },
  );
  if (!claimed) return;
  await Promise.all([
    grantPromotionFund(inviter._id, cfg.inviterAmount, '邀请好友首次使用小程序奖励'),
    grantPromotionFund(user._id, cfg.inviteeAmount, '通过好友邀请首次使用小程序奖励'),
  ]);
}

// 计算用户健康基金汇总（与 /user/me 保持一致）
async function computeHealthFund(user) {
  try {
    const { getCorporateFundAvailable, getPersonalFundAvailable } = require('../utils/healthFundPayment');
    const [enterpriseFund, personalFund] = await Promise.all([
      getCorporateFundAvailable(user),
      getPersonalFundAvailable(user),
    ]);
    const totalBalance = user.healthFundBalance || 0;
    const personal = Math.min(personalFund, totalBalance);
    return {
      total:     totalBalance,
      corporate: Math.min(enterpriseFund, Math.max(0, totalBalance - personal)),
      personal,
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

function httpsPostJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

let wechatMpAccessToken = '';
let wechatMpAccessTokenExpiresAt = 0;

async function getWechatMpAccessToken(appid, secret) {
  if (wechatMpAccessToken && Date.now() < wechatMpAccessTokenExpiresAt) return wechatMpAccessToken;
  const result = await httpsGet(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`);
  if (!result?.access_token) throw new Error(`获取小程序接口凭证失败: ${result?.errmsg || result?.errcode || '未知错误'}`);
  wechatMpAccessToken = result.access_token;
  wechatMpAccessTokenExpiresAt = Date.now() + Math.max(60, Number(result.expires_in || 7200) - 300) * 1000;
  return wechatMpAccessToken;
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
  const { phone, code, wxLoginCode, inviteCode } = req.body;
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

  if (!user.referralCode) {
    user.referralCode = crypto.randomBytes(6).toString('hex');
    await user.save();
  }
  if (user.onboardingCompleted) await applyFirstLoginRewards(user, inviteCode);
  else if (inviteCode) await User.updateOne({ _id: user._id }, { $set: { pendingInviteCode: String(inviteCode) } });
  user = await User.findById(user._id);
  const loginMethod = user.wechatMpOpenid ? 'phone_wechat' : 'phone';
  const sessionId = await beginLoginSession(req, user, loginMethod);
  user = await User.findById(user._id);
  const token = jwt.sign({ id: user._id, sessionId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

  const healthFund = await computeHealthFund(user);

  res.json({
    success: true,
    message: isNew ? '注册成功' : '登录成功',
    data: { token, user: { ...user.toObject(), healthFund }, isNew },
  });
});

// 小程序前后台切换与心跳，用于计算实际活跃时长；单次最多计入120秒，避免异常退出后虚增。
router.post('/session/activity', requireUser, async (req, res) => {
  try {
    const sessionId = req.authSessionId;
    if (!sessionId) return res.json({ success: true });
    const session = await LoginSession.findOne({ sessionId, user: req.user._id, logoutAt: null });
    if (!session) return res.json({ success: true });
    const now = new Date();
    const delta = Math.max(0, Math.min(120, Math.round((now - session.lastActivityAt) / 1000)));
    session.activeSeconds += delta;
    session.lastActivityAt = now;
    if (req.body?.event === 'logout') session.logoutAt = now;
    await session.save();
    if (delta) await User.updateOne({ _id: req.user._id }, { $inc: { totalLoginSeconds: delta } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: '登录时长记录失败' });
  }
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
  const { code, userInfo, inviteCode } = req.body;
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

    if (!user.referralCode) {
      user.referralCode = crypto.randomBytes(6).toString('hex');
      await user.save();
    }
    if (user.onboardingCompleted) await applyFirstLoginRewards(user, inviteCode);
    else if (inviteCode) await User.updateOne({ _id: user._id }, { $set: { pendingInviteCode: String(inviteCode) } });
    user = await User.findById(user._id);
    const sessionId = await beginLoginSession(req, user, 'wechat');
    user = await User.findById(user._id);
    const token = jwt.sign({ id: user._id, sessionId }, process.env.JWT_SECRET, {
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

// 微信手机号快捷登录：wx.login 确认微信身份，getPhoneNumber 的动态 code 确认手机号。
// 两者在服务端合并到同一个会员账号，避免先建微信临时账号、建档时又重复短信验证。
router.post('/wechat-mp/phone-login', async (req, res) => {
  const { loginCode, phoneCode, inviteCode } = req.body;
  if (!loginCode || !phoneCode) return res.status(400).json({ success: false, message: '缺少微信登录或手机号授权凭证' });
  const appid = process.env.WECHAT_MP_APPID;
  const secret = process.env.WECHAT_MP_SECRET;
  if (!appid || !secret) return res.status(503).json({ success: false, message: '小程序登录暂未配置，请使用手机号登录' });

  try {
    const [sessionData, accessToken] = await Promise.all([
      httpsGet(`https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(loginCode)}&grant_type=authorization_code`),
      getWechatMpAccessToken(appid, secret),
    ]);
    if (sessionData.errcode || !sessionData.openid) {
      return res.status(400).json({ success: false, message: `微信身份获取失败：${sessionData.errmsg || sessionData.errcode || '未返回 openid'}` });
    }
    const phoneData = await httpsPostJson(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
      { code: phoneCode },
    );
    const phone = phoneData?.phone_info?.phoneNumber || phoneData?.phone_info?.purePhoneNumber;
    if (phoneData?.errcode || !/^1[3-9]\d{9}$/.test(String(phone || ''))) {
      return res.status(400).json({ success: false, message: `微信手机号获取失败：${phoneData?.errmsg || phoneData?.errcode || '未返回有效手机号'}` });
    }

    const openid = sessionData.openid;
    let [openidUser, phoneUser] = await Promise.all([
      User.findOne({ wechatMpOpenid: openid }),
      User.findOne({ phone }),
    ]);
    if (openidUser?.isDeleted || phoneUser?.isDeleted) {
      return res.status(403).json({ success: false, message: '该会员信息已停用，如需恢复请联系管理员' });
    }
    if (openidUser?.phone && openidUser.phone !== phone) {
      return res.status(409).json({ success: false, message: '该微信已绑定其他手机号账户，请联系客服核验' });
    }

    const isNew = !openidUser && !phoneUser;
    let user;
    if (phoneUser) {
      if (openidUser && !openidUser._id.equals(phoneUser._id)) {
        await User.updateOne({ _id: openidUser._id }, { $unset: { wechatMpOpenid: 1 } });
      }
      user = await User.findByIdAndUpdate(phoneUser._id, {
        $set: { wechatMpOpenid: openid, contactPhone: phone },
      }, { new: true });
    } else if (openidUser) {
      user = await User.findByIdAndUpdate(openidUser._id, {
        $set: { phone, contactPhone: phone },
      }, { new: true });
    } else {
      user = await User.create({ phone, contactPhone: phone, wechatMpOpenid: openid, name: '微信用户' });
    }

    if (!user.referralCode) {
      user.referralCode = crypto.randomBytes(6).toString('hex');
      await user.save();
    }
    if (user.onboardingCompleted) await applyFirstLoginRewards(user, inviteCode);
    else if (inviteCode) await User.updateOne({ _id: user._id }, { $set: { pendingInviteCode: String(inviteCode) } });
    user = await User.findById(user._id);
    const sessionId = await beginLoginSession(req, user, 'phone_wechat');
    user = await User.findById(user._id);
    const token = jwt.sign({ id: user._id, sessionId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    });
    const healthFund = await computeHealthFund(user);
    res.json({ success: true, message: isNew ? '微信注册成功' : '登录成功', data: { token, user: { ...user.toObject(), healthFund }, isNew } });
  } catch (err) {
    console.error('wechat phone login error:', err.message);
    res.status(500).json({ success: false, message: '微信手机号登录失败，请稍后重试或使用验证码登录' });
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
