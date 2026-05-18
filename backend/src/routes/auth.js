const express = require('express');
const jwt = require('jsonwebtoken');
const https = require('https');
const User = require('../models/User');
const { seedUserData } = require('../config/seedData');
const router = express.Router();

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

// 内存存储验证码（演示用，生产环境用 Redis）
const codStore = new Map();

// 发送验证码（演示：直接返回，不真实发短信）
router.post('/send-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ success: false, message: '请输入正确的手机号' });
  }

  // 演示环境：固定验证码 123456，或随机6位
  const code = process.env.NODE_ENV === 'production'
    ? String(Math.floor(100000 + Math.random() * 900000))
    : '123456';

  codStore.set(phone, { code, expiry: Date.now() + 5 * 60 * 1000 });

  // 生产环境验证码通过短信发送，不打印到日志

  res.json({
    success: true,
    message: '验证码已发送',
    // 演示模式直接返回验证码
    ...(process.env.NODE_ENV !== 'production' && { code }),
  });
});

// 验证码登录 / 注册
router.post('/login', async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    return res.status(400).json({ success: false, message: '手机号和验证码不能为空' });
  }

  // 验证码校验
  const stored = codStore.get(phone);
  if (!stored || stored.code !== code || Date.now() > stored.expiry) {
    return res.status(400).json({ success: false, message: '验证码错误或已过期' });
  }
  codStore.delete(phone);

  // 找或创建用户
  let user = await User.findOne({ phone });
  const isNew = !user;
  if (!user) {
    const isDemo = phone === '13800138000';
    user = await User.create({ phone });
    // 仅演示账号初始化 mock 数据
    if (isDemo) {
      seedUserData(user._id).catch(console.error);
    }
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

  res.json({
    success: true,
    message: isNew ? '注册成功' : '登录成功',
    data: { token, user, isNew },
  });
});

// ── 微信网页授权登录 ──────────────────────────────────────────────
// POST /auth/wechat  body: { code }
// 前端用微信 OAuth code 换取 access_token + openid，创建或关联账号
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
    const isNew = !user;
    if (!user) {
      user = await User.create({
        wechatOpenid: openid,
        name: wxUser.nickname || '微信用户',
        // 手机号需用户后续绑定
      });
    } else if (wxUser.nickname && !user.name) {
      // 补全昵称
      user = await User.findByIdAndUpdate(user._id, { name: wxUser.nickname }, { new: true });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    });

    res.json({ success: true, message: isNew ? '微信登录成功' : '登录成功', data: { token, user, isNew } });
  } catch (err) {
    res.status(500).json({ success: false, message: '微信登录失败', error: err.message });
  }
});

module.exports = router;
