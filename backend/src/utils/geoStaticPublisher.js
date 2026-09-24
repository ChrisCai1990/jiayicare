const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// The public site is intentionally generated only on the production host.  This
// keeps the health planner's final action atomic from their perspective: once
// the request returns successfully, the reviewed page is already public.
const projectRoot = path.resolve(__dirname, '../../..');
const geoRoot = path.join(projectRoot, 'geo-knowledge-center');
const articlesRoot = path.join(geoRoot, 'content', 'articles');
const publicRoot = process.env.GEO_STATIC_ROOT || '/var/www/jiayicare-static/knowledge';
const privateRoots = new Set(['.preview', 'content', 'scripts']);
const privateFiles = new Set(['README.md', '.gitignore']);

function copyPublicTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (privateRoots.has(entry.name) || privateFiles.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyPublicTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function publishGeoArticle({ slug, publishedBy, publishedAt, alreadyPublishedSlugs = [] }) {
  const slugs = [...new Set([...alreadyPublishedSlugs, slug])];
  if (!slugs.length || !slugs.every(value => /^[a-z0-9-]+$/.test(String(value || '')))) throw new Error('无效的 GEO 稿件标识');
  const originalFiles = [];
  for (const itemSlug of slugs) {
    const articlePath = path.join(articlesRoot, `${itemSlug}.json`);
    if (!articlePath.startsWith(`${articlesRoot}${path.sep}`) || !fs.existsSync(articlePath)) continue;
    const original = fs.readFileSync(articlePath, 'utf8');
    const article = JSON.parse(original);
    article.status = 'published';
    if (itemSlug === slug) {
      article.reviewedBy = publishedBy || '健康规划师';
      article.reviewedAt = new Date(publishedAt || Date.now()).toISOString().slice(0, 10);
    }
    originalFiles.push([articlePath, original]);
    fs.writeFileSync(articlePath, `${JSON.stringify(article, null, 2)}\n`, 'utf8');
  }
  if (!originalFiles.some(([file]) => file.endsWith(`${path.sep}${slug}.json`))) throw new Error('未找到对应的官网内容源文件');

  try {
    execFileSync(process.execPath, [path.join(geoRoot, 'scripts', 'build-content.mjs'), '--publish'], { cwd: projectRoot, stdio: 'pipe' });
    copyPublicTree(geoRoot, publicRoot);
  } catch (error) {
    // Do not leave a failed release marked as published in the source file.
    for (const [articlePath, original] of originalFiles) fs.writeFileSync(articlePath, original, 'utf8');
    throw new Error(`官网发布失败：${error.stderr?.toString().trim() || error.message}`);
  }
}

module.exports = { publishGeoArticle };
