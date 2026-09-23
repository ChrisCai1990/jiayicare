const fs = require('fs');
const path = require('path');

const appDirectory = path.resolve(__dirname, '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(appDirectory, 'app.json'), 'utf8')).expo;
const easConfig = JSON.parse(fs.readFileSync(path.join(appDirectory, 'eas.json'), 'utf8'));
const blockers = [];
const warnings = [];

function requireValue(value, message) {
  if (!value || !String(value).trim()) blockers.push(message);
}

requireValue(appConfig.name, '缺少应用名称。');
requireValue(appConfig.version, '缺少应用版本号。');
requireValue(appConfig.android?.package, '缺少 Android 包名。');
requireValue(appConfig.ios?.bundleIdentifier, '缺少 iOS Bundle Identifier；请在 Apple Developer 中确认后填写。');

const privacyPolicyUrl = appConfig.extra?.release?.privacyPolicyUrl;
if (!/^https:\/\/.+/.test(privacyPolicyUrl || '')) {
  blockers.push('缺少可公开访问的 HTTPS 隐私政策链接；请在法律审核完成后填写 extra.release.privacyPolicyUrl。');
}

if (!easConfig.build?.production?.android?.buildType) {
  blockers.push('缺少 Android 正式构建配置。');
}
if (!easConfig.build?.production?.ios) {
  blockers.push('缺少 iOS 正式构建配置。');
}

if (!appConfig.owner || !appConfig.extra?.eas?.projectId) {
  warnings.push('未识别到完整的 EAS 项目信息，打包前请确认项目归属。');
}
if (!Array.isArray(appConfig.android?.permissions) || !appConfig.android.permissions.length) {
  warnings.push('Android 权限清单为空，请确认是否符合实际功能。');
}

if (warnings.length) {
  console.log('发布前提醒：');
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

if (blockers.length) {
  console.error('发布前阻断项：');
  blockers.forEach((blocker) => console.error(`- ${blocker}`));
  process.exitCode = 1;
} else {
  console.log('发布前配置检查通过。仍需完成真机冒烟测试与商店后台资料核验。');
}
