import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteDirectory = path.resolve(scriptDirectory, '..');
const contentDirectory = path.join(siteDirectory, 'content', 'articles');
const isPreview = process.argv.includes('--preview');
const isPublish = process.argv.includes('--publish');

if ((isPreview && isPublish) || (!isPreview && !isPublish)) {
  throw new Error('请指定一个模式：--preview（生成内部预览）或 --publish（生成已审核的公开内容）。');
}

const outputDirectory = isPreview
  ? path.join(siteDirectory, '.preview', 'guides')
  : path.join(siteDirectory, 'guides');
const sitemapPath = isPreview
  ? path.join(siteDirectory, '.preview', 'sitemap.xml')
  : path.join(siteDirectory, 'sitemap.xml');
const cataloguePath = isPreview
  ? path.join(siteDirectory, '.preview', 'published-articles.json')
  : path.join(siteDirectory, 'published-articles.json');
const siteUrl = process.env.SITE_URL || 'https://jiaycare.com';
const validStatuses = new Set(['draft', 'review', 'published']);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseArticle(fileName) {
  const article = JSON.parse(fs.readFileSync(path.join(contentDirectory, fileName), 'utf8'));
  const required = ['slug', 'status', 'title', 'summary', 'updatedAt', 'sections', 'sources'];
  for (const field of required) {
    if (!article[field] || (Array.isArray(article[field]) && article[field].length === 0)) {
      throw new Error(`${fileName} 缺少必填字段：${field}`);
    }
  }
  if (!validStatuses.has(article.status)) {
    throw new Error(`${fileName} 的 status 必须是 draft、review 或 published。`);
  }
  if (article.status === 'published' && (!article.reviewedBy || !article.reviewedAt)) {
    throw new Error(`${fileName} 标记为 published 前，必须填写 reviewedBy 和 reviewedAt。`);
  }
  if (!/^[a-z0-9-]+$/.test(article.slug)) {
    throw new Error(`${fileName} 的 slug 只能包含小写字母、数字和连字符。`);
  }
  return article;
}

function renderArticle(article, previewLabel) {
  const sections = article.sections.map((section) => `
      <section>
        <h2>${escapeHtml(section.heading)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n        ')}
      </section>`).join('');
  const sources = article.sources.map((source) => source.url
    ? `
        <li><a href="${escapeHtml(source.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(source.name)}</a></li>`
    : `
        <li>${escapeHtml(source.name)}</li>`).join('');
  const label = previewLabel ? '<p class="draft-notice">内部预览：本页尚未公开发布。</p>' : '';
  const reviewMeta = previewLabel ? '' : '<p class="review-meta">内容已完成专业审核</p>';
  const stylesheetPath = previewLabel ? '../../styles.css' : '../styles.css';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(article.summary)}">
  <title>${escapeHtml(article.title)}｜嘉医汇健康知识中心</title>
  <link rel="stylesheet" href="${stylesheetPath}">
</head>
<body>
  <main class="article-shell">
    <a class="back-link" href="../index.html">← 返回健康知识中心</a>
    <article>
      ${label ? `${label}\n      ` : ''}<p class="eyebrow">健康教育 · 更新于 ${escapeHtml(article.updatedAt)}</p>
      <h1>${escapeHtml(article.title)}</h1>
      <p class="lead">${escapeHtml(article.summary)}</p>
      ${reviewMeta ? `${reviewMeta}\n      ` : ''}${sections}
      <section class="source-list">
        <h2>参考来源</h2>
        <ul>${sources}
        </ul>
      </section>
      <aside class="medical-note">本页用于健康教育，不替代医生的诊断、治疗建议或紧急医疗服务。如有不适或个体化健康问题，请及时咨询专业人员。</aside>
    </article>
  </main>
</body>
</html>`;
}

const files = fs.readdirSync(contentDirectory).filter((file) => file.endsWith('.json'));
const articles = files.map(parseArticle);
const eligible = isPreview ? articles : articles.filter((article) => article.status === 'published');

fs.mkdirSync(outputDirectory, { recursive: true });
for (const article of eligible) {
  fs.writeFileSync(path.join(outputDirectory, `${article.slug}.html`), renderArticle(article, isPreview), 'utf8');
}

const catalogue = eligible.map((article) => ({
  title: article.title,
  summary: article.summary,
  updatedAt: article.updatedAt,
  href: `guides/${article.slug}.html`
}));
fs.mkdirSync(path.dirname(cataloguePath), { recursive: true });
fs.writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');

const staticGuides = isPublish && fs.existsSync(path.join(siteDirectory, 'guides'))
  ? fs.readdirSync(path.join(siteDirectory, 'guides'))
      .filter((file) => file.endsWith('.html') && !eligible.some((article) => `${article.slug}.html` === file))
      .map((file) => `guides/${file}`)
  : [];
const generatedGuides = eligible.map((article) => `guides/${article.slug}.html`);
const urls = isPreview ? generatedGuides : ['index.html', ...staticGuides, ...generatedGuides];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => {
  const resolvedUrl = url === 'index.html' ? '' : url;
  return `  <url><loc>${siteUrl.replace(/\/$/, '')}/${resolvedUrl}</loc></url>`;
}).join('\n')}\n</urlset>\n`;
fs.mkdirSync(path.dirname(sitemapPath), { recursive: true });
fs.writeFileSync(sitemapPath, sitemap, 'utf8');

console.log(`${isPreview ? '内部预览' : '公开内容'}已生成：${eligible.length} 篇，并已更新内容目录。`);
if (isPublish) console.log('仅 status 为 published 且已填写审核信息的文章会进入公开网站。');
