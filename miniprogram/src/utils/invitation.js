import Taro from '@tarojs/taro';

const normalize = (value) => {
  if (value === undefined || value === null) return '';
  try { return decodeURIComponent(String(value)).trim().toLowerCase(); }
  catch { return String(value).trim().toLowerCase(); }
};

const isReferralCode = (value) => /^[a-f0-9]{12}$/.test(value);

export function inviteCodeFromOptions(options = {}) {
  const direct = normalize(options.invite || options.inviteCode);
  if (isReferralCode(direct)) return direct;

  const scene = normalize(options.scene);
  if (!scene) return '';
  const match = scene.match(/(?:^|[?&])(?:invite|invitecode)=([^&]+)/i);
  const candidate = normalize(match ? match[1] : scene);
  return isReferralCode(candidate) ? candidate : '';
}

export function captureInviteCode(options = {}) {
  const code = inviteCodeFromOptions(options);
  if (!code) return '';
  try { Taro.setStorageSync('jy_invite_code', code); } catch {}
  return code;
}
