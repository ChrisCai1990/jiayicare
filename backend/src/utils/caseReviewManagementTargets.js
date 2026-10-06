function normalizeTargets(value) {
  if (!Array.isArray(value)) throw new Error('管理目标必须逐条填写');
  if (value.length > 12) throw new Error('管理目标最多 12 条');
  return value.map((row, index) => {
    const goal = String(row?.goal || '').trim();
    const focus = String(row?.focus || '').trim();
    if (!goal || !focus || goal.length > 240 || focus.length > 500) throw new Error(`第 ${index + 1} 条需填写管理目标和干预重点`);
    return { goal, focus, nutritionRelevant: row?.nutritionRelevant === true };
  });
}

function conclusionFromTargets(targets) {
  if (!targets.length) return '';
  const lines = targets.map(row => `目标：${row.goal}；干预重点：${row.focus}${row.nutritionRelevant ? '；营养相关：交营养师评估' : ''}`);
  const groups = [];
  for (let index = 0; index < lines.length; index += 2) groups.push(lines.slice(index, index + 2).join('；'));
  return `核心结论\n健康顾问已确认以下管理目标与干预重点。\n下一步行动\n${groups.join('\n')}`;
}

function fromConfirmedReviews(reviews) {
  return (reviews || []).flatMap(review => (review.conclusion?.managementTargets || []).map((row, index) => ({
    ...row,
    issueId: row.issueId || `review:${review._id}:target:${index}`,
    sourceReviewId: String(review._id), sourceTitle: review.title,
    sourceConfirmedAt: review.conclusion.confirmedAt,
    sourceIndex: index, sourceGoal: row.goal, sourceFocus: row.focus,
  })));
}

function proposeTargetsFromActions(actions) {
  return (actions || []).flatMap(line => {
    const goal = String(line).match(/(?:管理目标|目标)[：:]\s*(.*?)(?:[；;]\s*干预重点[：:]|$)/)?.[1]?.trim();
    const focus = String(line).match(/干预重点[：:]\s*(.*?)(?:[；;]\s*(?:时间(?:\/频次)?|频次|责任角色)[：:]|$)/)?.[1]?.trim();
    return goal && focus ? [{ goal: goal.slice(0, 240), focus: focus.slice(0, 500), nutritionRelevant: false }] : [];
  }).slice(0, 12);
}

const ISSUE_FAMILIES = [
  /高血压|血压/, /动脉粥样|动脉硬化|斑块/,
  /直肠|盲肠|结肠|肠镜|腺瘤|肠息肉/, /胃炎|胃黏膜|肠化|胃镜/,
  /前列腺/, /地中海贫血|贫血|HBB/, /肺磨玻璃|肺结节|肺CT|LDCT/,
];

function issueCards(content) {
  const lines = String(content || '').split(/\r?\n/);
  const cards = [];
  for (const line of lines) {
    const heading = line.trim().match(/^【问题[：:]\s*([^】]+)】$/);
    if (heading) cards.push({ title: heading[1].trim(), body: '' });
    else if (cards.length && !/^【综合关联与优先级】/.test(line.trim())) cards.at(-1).body += `${line}\n`;
  }
  return cards.filter(card => /管理目标[：:]|专业去向[：:]/.test(card.body));
}

function targetCoversIssue(target, title) {
  const text = `${target.goal || ''} ${target.focus || ''}`;
  const family = ISSUE_FAMILIES.find(pattern => pattern.test(title));
  if (family) return family.test(text);
  const compact = title.replace(/[（(].*?[）)]/g, '').replace(/[\s?？]/g, '').trim().slice(0, 80);
  return compact.length >= 2 && text.includes(compact);
}

function reconcileAnnualIssueTargets(existing, content) {
  const targets = normalizeTargets(existing || []);
  const uncovered = [];
  for (const card of issueCards(content)) {
    if (targets.some(target => targetCoversIssue(target, card.title))) continue;
    if (targets.length >= 12) { uncovered.push(card.title); continue; }
    targets.push({
      goal: `${card.title.slice(0, 100)}：明确年度管理目标与复评安排`,
      focus: '核对已审核依据和专业意见，确定管理措施、责任人及复评时间；由健康顾问逐项确认',
      nutritionRelevant: false,
    });
  }
  return { targets, uncovered };
}

module.exports = { normalizeTargets, conclusionFromTargets, fromConfirmedReviews, proposeTargetsFromActions, issueCards, reconcileAnnualIssueTargets };
