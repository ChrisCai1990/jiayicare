import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildCatalog } from './build-catalog.mjs';

function fixture(t, count = 7) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'guides'));
  fs.copyFileSync(new URL('./catalog-template.html', import.meta.url), path.join(root, 'scripts/catalog-template.html'));
  const items = Array.from({ length: count }, (_, i) => ({title: `文章 ${i}`, summary: `摘要 ${i}`, href: `guides/article-${i}.html`, publishedAt: `2026-09-${String(i + 1).padStart(2, '0')}`}));
  items.forEach(item => fs.writeFileSync(path.join(root, item.href), '<h1>公开文章</h1>'));
  fs.writeFileSync(path.join(root, 'published-articles.json'), JSON.stringify(items));
  fs.writeFileSync(path.join(root, 'sitemap.xml'), '<urlset></urlset>');
  return {root, items, read: file => fs.readFileSync(path.join(root, file), 'utf8')};
}
test('without JavaScript, every published article is reachable through real pagination links', t => {
  const {root, read} = fixture(t);
  buildCatalog(root);
  const first = read('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  const second = read('articles-page-2.html').replace(/<script[\s\S]*?<\/script>/g, '');
  assert.equal((first.match(/class="article-card"/g) || []).length, 6);
  assert.equal((second.match(/class="article-card"/g) || []).length, 1);
  assert.match(first, /href="articles-page-2.html#latest"/);
  assert.match(second, /href="guides\/article-0.html"/);
  assert.match(second, /canonical" href="https:\/\/jiaycare.com\/knowledge\/articles-page-2.html"/);
});
test('catalog data is escaped in both HTML and embedded JSON', t => {
  const {root, items, read} = fixture(t, 1);
  items[0].title = '</script><img src=x onerror=alert(1)>';
  fs.writeFileSync(path.join(root, 'published-articles.json'), JSON.stringify(items));
  buildCatalog(root);
  assert.ok(!read('index.html').includes('<img src=x'));
  assert.match(read('index.html'), /&lt;\/script&gt;/);
  assert.match(read('index.html'), /\\u003c\/script>/);
});
test('unlisted draft files never appear in the public catalogue', t => {
  const {root, read} = fixture(t, 1);
  fs.writeFileSync(path.join(root, 'guides/private-draft.html'), '未审核');
  buildCatalog(root);
  assert.ok(!read('index.html').includes('private-draft'));
});
test('unsafe and missing article links fail before writing a catalogue', t => {
  const {root, items} = fixture(t, 1);
  for (const href of ['../secret.html', 'javascript:alert(1)', 'guides/missing.html']) {
    items[0].href = href;
    fs.writeFileSync(path.join(root, 'published-articles.json'), JSON.stringify(items));
    assert.throws(() => buildCatalog(root), /公开目录链接无效/);
  }
});
test('rebuilding keeps one sitemap entry and removes only obsolete pagination', t => {
  const {root, items, read} = fixture(t);
  buildCatalog(root); buildCatalog(root);
  assert.equal((read('sitemap.xml').match(/articles-page-2.html/g) || []).length, 1);
  fs.writeFileSync(path.join(root, 'published-articles.json'), JSON.stringify(items.slice(0, 1)));
  buildCatalog(root);
  assert.ok(!fs.existsSync(path.join(root, 'articles-page-2.html')));
  assert.ok(fs.existsSync(path.join(root, 'guides/article-0.html')));
  assert.ok(!read('sitemap.xml').includes('articles-page-2.html'));
});
