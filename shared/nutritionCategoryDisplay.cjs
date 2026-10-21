// Presentation only: never infer grams from a food name, serving count or energy.
const CATEGORY = /^(主食|谷薯类|谷薯|荤菜|肉类|鱼虾类|蔬菜类|蔬菜|水果类|水果|奶制品|奶类|乳制品|蛋类|豆制品|豆类|坚果类|坚果|油脂|烹调油|食用油)/;

function categoryDisplay(text) {
  return String(text || '').split(/\n+/).filter(line => line.trim()).map(line => {
    const clean = line.trim().replace(/^[-*•\d.、\s]+/, '');
    const category = clean.match(CATEGORY)?.[1];
    if (!category) return '食物类别及分量待核对';
    const rest = clean.slice(category.length);
    const values = [...rest.matchAll(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g|克|ml|毫升|个|份|片|两)/gi)];
    if (/[；;]\s*(主食|荤菜|蔬菜|水果|奶制品|蛋类|豆制品)/.test(rest)) return `${category}：分量待核对`;
    if (!values.length || /或|任选|[-~～—–至]\s*\d|\d\s*[-~～—–至]/.test(rest)) return `${category}：分量待核对`;
    const basis = [...new Set(rest.match(/生重|熟重|干重|可食部/g) || [])];
    if (basis.length > 1) return `${category}：分量待核对（重量口径不同）`;
    // An explicit total before the ingredient parentheses takes precedence.
    const direct = rest.match(/^[\s：:]*([\d.]+)\s*(kg|千克|公斤|g|克|ml|毫升|个|份|片|两)/i);
    const parts = direct ? [direct] : values;
    const units = parts.map(match => ({ kg: 'g', 千克: 'g', 公斤: 'g', 克: 'g', 毫升: 'ml' }[match[2].toLowerCase()] || match[2].toLowerCase()));
    if (new Set(units).size !== 1 || (parts.length > 1 && /合计|共|总计|约/.test(rest))) return `${category}：分量待核对`;
    const total = parts.reduce((sum, match) => sum + Number(match[1]) * (/^(kg|千克|公斤)$/i.test(match[2]) ? 1000 : 1), 0);
    if (!(total > 0)) return `${category}：分量待核对`;
    return `${category} ${Number(total.toFixed(3))} ${units[0]}${basis.length ? `（${basis[0]}）` : ''}`;
  }).join('\n');
}

function categoryMeals(modules = {}) {
  const result = { ...modules };
  for (const key of ['breakfast', 'lunch', 'dinner', 'snack']) {
    if (!modules[key] || typeof modules[key].content !== 'string') continue;
    const content = categoryDisplay(modules[key].content);
    result[key] = { ...modules[key], content };
    if (content !== modules[key].content) result[key].categorySource = modules[key].categorySource || modules[key].content;
  }
  return result;
}
module.exports = { categoryDisplay, categoryMeals };
