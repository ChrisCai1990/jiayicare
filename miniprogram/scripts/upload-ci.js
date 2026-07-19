// 小程序体验版一键上传脚本，用 miniprogram-ci 代替手动打开开发者工具点「上传」。
// 前置条件：微信公众平台(mp.weixin.qq.com) → 开发 → 开发管理 → 开发设置 → 小程序代码上传 → 生成的私钥文件，
// 存到本机任意路径，通过环境变量 MP_CI_PRIVATE_KEY_PATH 指定（不进代码仓库，参考 accounts.md 密钥管理约定）。
// 用法：
//   1. 先 npm run build:weapp 生成 dist/
//   2. 设置环境变量 MP_CI_PRIVATE_KEY_PATH 指向私钥文件
//   3. node scripts/upload-ci.js "本次更新说明文字"
// 上传后仍需人工登录公众平台把这个体验版提交审核、审核通过后手动发布——这两步没有绕过的办法。
const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

const APPID = 'wx50062146332b1b20';
const PROJECT_PATH = path.join(__dirname, '..', 'dist');
const PRIVATE_KEY_PATH = process.env.MP_CI_PRIVATE_KEY_PATH;

async function main() {
  if (!PRIVATE_KEY_PATH) {
    console.error('缺少环境变量 MP_CI_PRIVATE_KEY_PATH，请指向微信公众平台生成的上传私钥文件路径。');
    process.exit(1);
  }
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(`私钥文件不存在：${PRIVATE_KEY_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(PROJECT_PATH)) {
    console.error(`构建产物不存在：${PROJECT_PATH}，请先运行 npm run build:weapp`);
    process.exit(1);
  }

  const desc = process.argv[2] || `本地上传 ${new Date().toLocaleString('zh-CN')}`;

  // version 用日期时间戳，避免和公众平台历史版本号冲突；正式发布版本号建议手动语义化管理
  const version = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '');

  const project = new ci.Project({
    appid: APPID,
    type: 'miniProgram',
    projectPath: PROJECT_PATH,
    privateKeyPath: PRIVATE_KEY_PATH,
    ignores: ['node_modules/**/*'],
  });

  try {
    const uploadResult = await ci.upload({
      project,
      version,
      desc,
      setting: {
        es6: true,
        es7: true,
        minify: true,
        codeProtect: false,
        minifyWXSS: true,
        minifyWXML: true,
        autoPrefixWXSS: true,
      },
      onProgressUpdate: () => {},
    });
    console.log('上传成功:', uploadResult);
    console.log(`版本号: ${version}`);
    console.log('下一步：登录 https://mp.weixin.qq.com 找到这个体验版，提交审核 → 审核通过后手动发布。');
  } catch (err) {
    console.error('上传失败:', err.message || err);
    process.exit(1);
  }
}

main();
