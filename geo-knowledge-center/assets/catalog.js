(function () {
  'use strict';
  var form = document.getElementById('article-search-form');
  var input = document.getElementById('article-search-input');
  var clear = document.getElementById('clear-article-search');
  var list = document.getElementById('published-articles');
  var summary = document.getElementById('article-search-summary');
  var nav = document.getElementById('published-articles-pagination');
  var original = { cards: list.innerHTML, nav: nav.innerHTML, summary: summary.textContent };
  try {
    var articles = JSON.parse(document.getElementById('article-catalog-data').textContent);
    function render() {
      var query = (new URLSearchParams(location.search).get('q') || '').trim();
      input.value = query;
      clear.hidden = !query;
      if (!query) {
        list.innerHTML = original.cards;
        nav.innerHTML = original.nav;
        nav.hidden = !original.nav;
        summary.textContent = original.summary;
        return;
      }
      var matches = articles.filter(function (item) {
        return [item.title, item.summary, item.keywords].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN').includes(query.toLocaleLowerCase('zh-CN'));
      });
      list.replaceChildren();
      matches.forEach(function (item) {
        var link = document.createElement('a'); link.className = 'article-card'; link.href = item.href;
        [['span', 'tag', '已审核发布 · ' + (item.publishedAt || item.updatedAt)], ['h3', '', item.title], ['p', '', item.summary], ['span', 'read', '阅读内容 →']].forEach(function (part) {
          var el = document.createElement(part[0]); el.className = part[1]; el.textContent = part[2]; link.appendChild(el);
        });
        list.appendChild(link);
      });
      if (!matches.length) {
        var empty = document.createElement('p'); empty.className = 'article-empty'; empty.textContent = '没有找到相关内容。可尝试更换关键词，或清空搜索查看全部文章。'; list.appendChild(empty);
      }
      summary.textContent = '“' + query + '”相关内容：' + matches.length + ' 篇';
      nav.hidden = true;
    }
    function change(query) {
      var url = new URL(location.href);
      if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      url.searchParams.delete('page');
      history.pushState({}, '', url.pathname + url.search + '#latest'); render();
    }
    form.addEventListener('submit', function (event) { event.preventDefault(); change(input.value.trim()); });
    clear.addEventListener('click', function () { change(''); input.focus(); });
    window.addEventListener('popstate', render);
    // Preserve previously shared ?page= links while keeping real HTML pagination.
    var oldPage = Number(new URLSearchParams(location.search).get('page'));
    if (Number.isInteger(oldPage) && oldPage > 1 && oldPage <= Math.ceil(articles.length / 6)) {
      var target = new URL('articles-page-' + oldPage + '.html', location.href);
      var query = new URLSearchParams(location.search).get('q'); if (query) target.searchParams.set('q', query);
      target.hash = 'latest'; location.replace(target.href); return;
    }
    form.hidden = false;
    render();
  } catch (error) {
    form.hidden = true;
    summary.textContent += '；搜索暂不可用，可继续阅读或翻页。';
  }
}());
