import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function buildCatalog(siteDirectory = root, siteUrl = 'https://jiaycare.com/knowledge') {
  const articles = JSON.parse(fs.readFileSync(path.join(siteDirectory, 'published-articles.json'), 'utf8'));
  articles.sort((a, b) => String(b.publishedAt || b.updatedAt).localeCompare(String(a.publishedAt || a.updatedAt)) || a.title.localeCompare(b.title, 'zh-CN'));
  for (const item of articles) {
    if (!/^guides\/[a-z0-9-]+\.html$/.test(item.href) || !fs.existsSync(path.join(siteDirectory, item.href))) throw new Error(`公开目录链接无效：${item.href}`);
  }
  const template = fs.readFileSync(path.join(siteDirectory, 'scripts/catalog-template.html'), 'utf8');
  const count = Math.max(1, Math.ceil(articles.length / 6));
  const pageFile = page => page === 1 ? 'index.html' : `articles-page-${page}.html`;
  const pageUrl = page => page === 1 ? './#latest' : `${pageFile(page)}#latest`;
  const pages = [];
  for (let page = 1; page <= count; page += 1) {
    const cards = articles.slice((page - 1) * 6, page * 6).map(item => `<a class="article-card" href="${escape(item.href)}"><span class="tag">已审核发布 · ${escape(item.publishedAt || item.updatedAt)}</span><h3>${escape(item.title)}</h3><p>${escape(item.summary)}</p><span class="read">阅读内容 →</span></a>`).join('\n');
    const nav = count > 1 ? `${page > 1 ? `<a class="page-button" rel="prev" href="${pageUrl(page - 1)}">上一页</a>` : ''}${Array.from({ length: count }, (_, i) => `<a class="page-button${i + 1 === page ? ' current' : ''}"${i + 1 === page ? ' aria-current="page"' : ''} href="${pageUrl(i + 1)}">${i + 1}</a>`).join('')}${page < count ? `<a class="page-button" rel="next" href="${pageUrl(page + 1)}">下一页</a>` : ''}` : '';
    const values = {
      TITLE: page === 1 ? '理解健康｜嘉医汇健康知识中心' : `理解健康 · 第 ${page} 页｜嘉医汇`,
      CANONICAL: `${siteUrl.replace(/\/$/, '')}/${page === 1 ? '' : pageFile(page)}`,
      CARDS: cards || '<p>暂无已公开文章。</p>',
      PAGINATION: nav,
      SUMMARY: `共 ${articles.length} 篇公开文章，第 ${page} / ${count} 页`,
      PAGE: String(page),
      ARTICLES: JSON.stringify(articles).replaceAll('<', '\\u003c'),
    };
    const html = template.replace(/\{\{([A-Z]+)\}\}/g, (_, key) => values[key]);
    fs.writeFileSync(path.join(siteDirectory, pageFile(page)), html);
    pages.push(pageFile(page));
  }
  // Only remove obsolete generated pagination pages, never article pages.
  for (const file of fs.readdirSync(siteDirectory)) {
    if (/^articles-page-\d+\.html$/.test(file) && !pages.includes(file)) fs.unlinkSync(path.join(siteDirectory, file));
  }
  const sitemapPath = path.join(siteDirectory, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    let sitemap = fs.readFileSync(sitemapPath, 'utf8').replace(/\s*<url><loc>[^<]*\/articles-page-\d+\.html<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/url>/g, '');
    const extra = pages.filter(file => file !== 'index.html').map(file => `  <url><loc>${siteUrl.replace(/\/$/, '')}/${file}</loc></url>\n`).join('');
    fs.writeFileSync(sitemapPath, sitemap.replace('</urlset>', extra + '</urlset>'));
  }
  return pages;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`静态目录已生成：${buildCatalog().length} 页。`);
}
