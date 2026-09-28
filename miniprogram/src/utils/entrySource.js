import Taro from '@tarojs/taro';

// 小程序码的 scene 由微信透传。仅接受预定义渠道，避免把任意外部文本写入会员档案。
const SOURCE_LABELS = {
  official_site: '官网服务入口',
  wechat_service: '微信客服',
  partner: '合作机构转介',
  staff_referral: '工作人员转介',
};

const normalize = (value) => {
  if (value === undefined || value === null) return '';
  try { return decodeURIComponent(String(value)).trim().toLowerCase(); }
  catch { return String(value).trim().toLowerCase(); }
};

export function entrySourceFromOptions(options = {}) {
  const direct = normalize(options.source || options.channel || options.src);
  if (SOURCE_LABELS[direct]) return direct;

  const scene = normalize(options.scene);
  if (!scene) return '';
  const match = scene.match(/(?:^|[?&])(?:source|channel|src)=([^&]+)/i);
  const candidate = normalize(match ? match[1] : scene);
  return SOURCE_LABELS[candidate] ? candidate : '';
}

export function captureEntrySource(options = {}) {
  const source = entrySourceFromOptions(options);
  if (!source) return '';
  try {
    // 首次触点优先，避免后续打开其他页面覆盖实际进入渠道。
    if (!Taro.getStorageSync('jy_entry_source')) Taro.setStorageSync('jy_entry_source', source);
  } catch {}
  return source;
}

export function savedEntrySource() {
  try {
    const source = normalize(Taro.getStorageSync('jy_entry_source'));
    return SOURCE_LABELS[source] ? source : '';
  } catch { return ''; }
}

export function entrySourceLabel(source) {
  return SOURCE_LABELS[normalize(source)] || '';
}
