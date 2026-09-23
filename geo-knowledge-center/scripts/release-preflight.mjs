import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteDirectory = path.resolve(scriptDirectory, '..');
const blockers = [];
const warnings = [];

function read(relativePath) {
  const target = path.join(siteDirectory, relativePath);
  if (!fs.existsSync(target)) {
    blockers.push(`缺少发布必需文件：${relativePath}`);
    return '';
  }
  return fs.readFileSync(target, 'utf8');
}

const indexPage = read('index.html');
const consultationPage = read('start-here.html');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
const privacyPage = path.join(siteDirectory, 'privacy-policy.html');

if (!indexPage.includes('嘉医汇健康知识中心')) blockers.push('首页缺少知识中心标题。');
if (!indexPage.includes('start-here.html') || !consultationPage.includes('tel:19106761448')) {
  blockers.push('咨询承接页或客服电话入口配置不完整。');
}
if (!robots.includes('https://jiaycare.com/sitemap.xml')) blockers.push('robots.txt 未指向正式域名的站点地图。');
if (!sitemap.includes('https://jiaycare.com/')) blockers.push('sitemap.xml 未使用正式域名。');
if (!fs.existsSync(privacyPage)) blockers.push('缺少已法务确认的 privacy-policy.html；不可配置 App 的公开隐私政策链接。');

const legacyGuidesDirectory = path.join(siteDirectory, 'guides');
if (fs.existsSync(legacyGuidesDirectory)) {
  const pendingGuides = fs.readdirSync(legacyGuidesDirectory)
    .filter((file) => file.endsWith('.html'))
    .filter((file) => fs.readFileSync(path.join(legacyGuidesDirectory, file), 'utf8').includes('健康教育草稿'));
  if (pendingGuides.length) {
    blockers.push(`发现 ${pendingGuides.length} 篇未审核静态文章仍位于公开目录：${pendingGuides.join('、')}。请完成审核并迁入内容工作流，或在发布前移出公开目录。`);
  }
}

const articleDirectory = path.join(siteDirectory, 'content', 'articles');
const articles = fs.existsSync(articleDirectory)
  ? fs.readdirSync(articleDirectory).filter((file) => file.endsWith('.json')).map((file) => JSON.parse(fs.readFileSync(path.join(articleDirectory, file), 'utf8')))
  : [];
const published = articles.filter((article) => article.status === 'published');
if (!published.length) warnings.push('尚无已审核发布的结构化文章；首页的“最新审核内容”将保持隐藏。');
for (const article of published) {
  if (!article.reviewedBy || !article.reviewedAt) blockers.push(`文章 ${article.slug} 标记为已发布但缺少内部审核记录。`);
}

if (warnings.length) {
  console.log('发布前提醒：');
  warnings.forEach((warning) => console.log(`- ${warning}`));
}
if (blockers.length) {
  console.error('网站发布阻断项：');
  blockers.forEach((blocker) => console.error(`- ${blocker}`));
  process.exitCode = 1;
} else {
  console.log('网站发布前检查通过。仍请在正式部署后复查域名、HTTPS、移动端和链接跳转。');
}
