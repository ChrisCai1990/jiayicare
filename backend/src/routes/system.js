const express = require('express');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const HealthRecord = require('../models/HealthRecord');
const router = express.Router();

// POST /api/system/push — 检查用户状态并推送系统消息（每类每24h最多一条）
router.post('/push', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const pushed = [];

    // 去重：若该 title 的系统消息已在 24h 内推送过，跳过
    async function maybeCreate(title, content) {
      const exists = await Message.findOne({
        user: userId,
        type: 'system',
        title,
        createdAt: { $gt: oneDayAgo },
      });
      if (!exists) {
        await Message.create({
          user: userId,
          type: 'system',
          sender: '系统通知',
          title,
          content,
          unread: true,
        });
        pushed.push(title);
      }
    }

    // ── 1. 血压异常 ─────────────────────────────────────────────────
    const latestBP = await HealthRecord.findOne({ user: userId, type: 'bloodPressure' })
      .sort({ recordedAt: -1 });
    if (latestBP) {
      const sys = latestBP.extra?.sys ? parseFloat(latestBP.extra.sys) : parseFloat(latestBP.value);
      if (sys >= 140) {
        await maybeCreate(
          '血压异常提醒',
          `您最近一次血压记录收缩压为 ${sys} mmHg，已超出正常范围（≥140 mmHg）。建议及时联系主治医师，避免剧烈活动，并按医嘱服药。`
        );
      } else if (sys >= 130) {
        await maybeCreate(
          '血压偏高提醒',
          `您最近一次血压收缩压为 ${sys} mmHg，处于偏高区间（130–139 mmHg）。建议控制钠盐摄入、保持规律作息，并持续监测。`
        );
      }
    }

    // ── 2. 血糖异常 ─────────────────────────────────────────────────
    const latestBS = await HealthRecord.findOne({ user: userId, type: 'bloodSugar' })
      .sort({ recordedAt: -1 });
    if (latestBS) {
      const val = parseFloat(latestBS.value);
      if (val >= 7.0) {
        await maybeCreate(
          '血糖偏高提醒',
          `您最近一次空腹血糖记录为 ${val} mmol/L，超出正常上限（<7.0 mmol/L）。建议调整饮食结构，减少精制糖摄入，并及时复诊。`
        );
      } else if (val < 3.9) {
        await maybeCreate(
          '血糖偏低提醒',
          `您最近一次血糖记录为 ${val} mmol/L，低于正常下限（3.9 mmol/L）。请及时补充糖分，如反复出现低血糖请就医检查。`
        );
      }
    }

    // ── 3. 心率异常 ─────────────────────────────────────────────────
    const latestHR = await HealthRecord.findOne({ user: userId, type: 'heartRate' })
      .sort({ recordedAt: -1 });
    if (latestHR) {
      const hr = parseFloat(latestHR.value);
      if (hr > 100) {
        await maybeCreate(
          '心率偏快提醒',
          `您最近一次静息心率为 ${hr} bpm，超过正常范围（60–100 bpm）。如持续出现请避免剧烈活动并联系医生。`
        );
      } else if (hr < 50) {
        await maybeCreate(
          '心率偏慢提醒',
          `您最近一次心率记录为 ${hr} bpm，低于正常范围。如伴有头晕、乏力等症状，请及时就医。`
        );
      }
    }

    // ── 4. 服务包即将到期 ────────────────────────────────────────────
    if (req.user.serviceExpiry) {
      const expiry = new Date(req.user.serviceExpiry);
      const daysLeft = Math.ceil((expiry - now) / 86400000);
      if (daysLeft > 0 && daysLeft <= 14) {
        await maybeCreate(
          '服务包即将到期',
          `您的"${req.user.servicePackage || '健康服务包'}"将在 ${daysLeft} 天后到期，到期后将无法享受专属医生随访和健管服务。请前往"我的"页面及时续费。`
        );
      }
    }

    // ── 5. 近7天无健康记录 ──────────────────────────────────────────
    const recentCount = await HealthRecord.countDocuments({
      user: userId,
      recordedAt: { $gt: sevenDaysAgo },
    });
    if (recentCount === 0) {
      await maybeCreate(
        '健康记录提醒',
        '您已超过7天未记录健康数据。坚持定期监测血压、血糖等指标，有助于及早发现健康变化。点击首页"+"立即录入。'
      );
    }

    res.json({ success: true, pushed, message: pushed.length > 0 ? `推送 ${pushed.length} 条系统通知` : '暂无新通知' });
  } catch (err) {
    console.error('系统推送失败:', err);
    res.status(500).json({ success: false, message: '推送失败', error: err.message });
  }
});

module.exports = router;
