const { createHash } = require('node:crypto');

class PushDeviceInputError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new PushDeviceInputError(status, message); }
function destination(input) {
  if (!['huawei', 'apns'].includes(input?.provider)) fail(400, '暂不支持此推送通道');
  const token = input.token;
  if (typeof token !== 'string' || !token.length || token.length > 4096 || /\s|[\x00-\x1f\x7f]/.test(token)) {
    fail(400, '设备推送凭据无效');
  }
  if (input.provider === 'apns' && (!/^[a-f0-9]{2,512}$/.test(token) || token.length % 2 !== 0)) fail(400, '苹果推送凭据无效');
  return { _id: createHash('sha256').update(`${input.provider}:${token}`).digest('hex'), provider: input.provider, token };
}

function createPushDeviceRegistry({ Device, Session, enabled }) {
  function owner(user, sessionId) {
    if (!user?._id || user.isDeleted || typeof sessionId !== 'string' || !sessionId) fail(401, '请重新登录后启用通知');
    return { user: user._id, tenantId: user.tenantId || null, sessionId };
  }
  return {
    async register(user, sessionId, input) {
      const binding = owner(user, sessionId);
      const device = destination(input);
      if (!enabled(device.provider)) fail(503, '此设备的系统推送尚未开放');
      if (!await Session.exists({ user: binding.user, sessionId, logoutAt: null })) fail(401, '登录已退出');
      // Atomic ownership transfer on account switch; no duplicate destinations.
      // Client user/tenant/session fields are intentionally ignored.
      const previous = await Device.findById(device._id).select('user').lean();
      await Device.updateOne({ _id: device._id }, { $set: { provider: device.provider, token: device.token, ...binding,
        ...(previous && String(previous.user) !== String(binding.user) ? { settings: {} } : {}),
      } }, { upsert: true, runValidators: true });
    },
    async unregister(user, sessionId, input) {
      const binding = owner(user, sessionId);
      const device = destination(input);
      // An old account/session cannot unregister a destination now owned by another.
      await Device.deleteOne({ _id: device._id, ...binding });
    },
    async destinations(user) {
      if (!enabled() || !user?._id || user.isDeleted) return [];
      const devices = await Device.find({ user: user._id, tenantId: user.tenantId || null })
        .select('+token +sessionId').lean();
      const sessions = await Session.find({ user: user._id, sessionId: { $in: devices.map(d => d.sessionId) }, logoutAt: null })
        .select('sessionId').lean();
      const active = new Set(sessions.map(s => s.sessionId));
      // Future dispatcher must call this at send time, never cache across logout.
      return devices.filter(d => active.has(d.sessionId) && enabled(d.provider)).map(d => ({ provider: d.provider, token: d.token,
        ...(d.settings && Object.keys(d.settings).length ? { settings: d.settings } : {}),
      }));
    },
  };
}
module.exports = { createPushDeviceRegistry, PushDeviceInputError };
