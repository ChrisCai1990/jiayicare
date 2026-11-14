const { sections } = require('./reviewFourSections');

const labels = ['饮食', '运动', '睡眠', '烟酒', '情绪'];
const types = [['diet'], ['exercise'], ['sleep'], ['smoking', 'smoke', 'alcohol', 'tobacco'], ['mood', 'emotion']];

function correctMissingLifestyle(content, records = []) {
  const facts = sections({ records })[1];
  const lines = String(content || '').split('\n');
  const changed = [];
  let section = '';
  const corrected = lines.map(line => {
    if (/^[一二三四]、/.test(line)) section = line;
    if (!section.includes('生活方式关联')) return line;
    const index = labels.findIndex(label => new RegExp(`^- ${label}：\\s*本期暂无记录[。.]?\\s*$`).test(line));
    if (index < 0 || !records.some(row => types[index].includes(row.type))) return line;
    changed.push(labels[index]);
    return `- ${labels[index]}：${facts[index].replace(/^[^：]+：/, '')}`;
  });
  return { content: corrected.join('\n'), changed };
}

module.exports = { correctMissingLifestyle };
