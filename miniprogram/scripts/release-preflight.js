const fs = require('fs');
const path = require('path');

const projectDirectory = path.resolve(__dirname, '..');
const blockers = [];
const warnings = [];

function read(relativePath) {
  const target = path.join(projectDirectory, relativePath);
  if (!fs.existsSync(target)) {
    blockers.push(`缺少必要文件：${relativePath}`);
    return '';
  }
  return fs.readFileSync(target, 'utf8');
}

const projectConfigText = read('project.config.json');
const appConfig = read('src/app.config.js');
const legalPage = read('src/pages/legal/index.jsx');
const feedbackPage = read('src/pages/profile/feedback/index.jsx');

let projectConfig = {};
try {
  projectConfig = JSON.parse(projectConfigText);
} catch {
  blockers.push('project.config.json 不是有效 JSON。');
}

if (!/^wx[a-zA-Z0-9]{16}$/.test(projectConfig.appid || '')) {
  blockers.push('小程序 AppID 缺失或格式异常。');
}
if (projectConfig.miniprogramRoot !== 'dist/') {
  blockers.push('小程序构建目录应为 dist/。');
}

for (const page of ['pages/legal/index', 'pages/profile/feedback/index', 'pages/profile/index/index']) {
  if (!appConfig.includes(`'${page}'`)) blockers.push(`未在页面配置中注册：${page}`);
}
if (!legalPage.includes('隐私政策') || !legalPage.includes('账号注销')) {
  blockers.push('隐私政策页面缺少隐私权利或账号注销说明。');
}
if (!feedbackPage.includes('账号注销申请')) {
  blockers.push('帮助与反馈页缺少账号注销申请入口。');
}
if (!fs.existsSync(path.join(projectDirectory, 'dist'))) {
  warnings.push('尚未发现 dist/ 构建产物；提审前必须使用完整 Taro 环境重新构建。');
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
  console.log('小程序发布前静态检查通过。仍需完成完整编译、微信开发者工具预览与真机验收。');
}
