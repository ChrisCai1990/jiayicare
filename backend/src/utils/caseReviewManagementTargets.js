function normalizeTargets(value) {
  if (!Array.isArray(value)) throw new Error('管理目标必须逐条填写');
  if (value.length > 12) throw new Error('管理目标最多 12 条');
  return value.map((row, index) => {
    const goal = String(row?.goal || '').trim();
    const focus = String(row?.focus || '').trim();
    if (!goal || !focus || goal.length > 240 || focus.length > 500) throw new Error(`第 ${index + 1} 条需填写管理目标和干预重点`);
    return { goal, focus, nutritionRelevant: row?.nutritionRelevant === true,
      ...(row?.issueId ? { issueId: String(row.issueId) } : {}) };
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

// The reviewed concern list decides what enters annual management. Discussion cards
// supply wording only; they cannot add a concern or turn an excluded one into a goal.
function targetsFromIncludedConcerns(concerns, content, previous = []) {
  const cards = issueCards(content);
  return (concerns || []).filter(row => row.status === 'included' && require('./annualConcernRetirement').isActiveAnnualConcern(row)
    && !require('./annualConcernTypes').isEvidenceConcern(row)).map(row => {
    const title = String(row.title || '').trim();
    const card = cards.find(item => item.title.includes(title) || title.includes(item.title));
    const line = card?.body.match(/管理目标[：:]\s*([^\n]*)/)?.[1] || '';
    const goal = line.split(/[；;]\s*干预重点[：:]/)[0].trim();
    const focus = (line.match(/[；;]\s*干预重点[：:]\s*(.*)/)?.[1]?.trim() ||
      card?.body.match(/(?:^|\n)干预重点[：:]\s*([^\n]*)/)?.[1]?.trim() || '')
      .split(/[；;]\s*(?:时间|频次|责任角色)[：:]/)[0].trim();
    const old = previous.find(item => String(item.issueId || '') === String(row.id));
    const unresolved = /^(待确认|待核实|待确定)/;
    return { issueId: String(row.id),
      goal: unresolved.test(goal) ? '' : goal.slice(0, 240) || old?.goal || '',
      focus: unresolved.test(focus) || unresolved.test(goal) ? '' : focus.slice(0, 500) || old?.focus || '',
      nutritionRelevant: old?.nutritionRelevant === true || ['nutrition', 'both'].includes(row.pathway) };
  });
}

function validateAnnualTargets(concerns, targets) {
  const included = (concerns || []).filter(row => row.status === 'included' && require('./annualConcernRetirement').isActiveAnnualConcern(row)
    && !require('./annualConcernTypes').isEvidenceConcern(row));
  const ids = included.map(row => String(row.id));
  if (ids.length !== targets.length || ids.some(id => targets.filter(row => row.issueId === id).length !== 1))
    throw new Error('年度管理目标必须与已纳入的问题逐项对应；请重新整理结论并核对目标');
}

module.exports = { normalizeTargets, conclusionFromTargets, fromConfirmedReviews, proposeTargetsFromActions, issueCards, targetsFromIncludedConcerns, validateAnnualTargets };
