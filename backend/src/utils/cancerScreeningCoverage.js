// 肿瘤筛查覆盖度评估引擎
// 输入：患者性别/年龄 + 全部专项筛查报告
// 输出：每个适用肿瘤的覆盖状态（已覆盖 / 待补做 + 原因），供 AI 健康分析的「筛查覆盖度」维度使用。
// 规则来源：config/cancerScreeningRules.js（金娟医学口径固化）。

const { CANCER_RULES } = require('../config/cancerScreeningRules');

function reportDate(r) { return r.checkDate || r.date || r.createdAt || ''; }
function reportYear(r) {
  const d = reportDate(r);
  if (r.reportYear) return Number(r.reportYear);
  return d ? new Date(d).getFullYear() : null;
}

// 在一批报告里，找出某检查项「最近一次做的日期」；itemNeg 用于判断阴性（HP专用）。
// 匹配范围：报告 title / screeningL2 / 各 reportItem 的 name。
function findDoneRecords(reports, matchNames) {
  const hits = [];
  reports.forEach(r => {
    const titleText = `${r.title || ''} ${r.screeningL2 || ''}`;
    const titleHit = matchNames.some(n => titleText.toLowerCase().includes(n.toLowerCase()));
    const items = (r.reportItems || []).filter(it =>
      it.name && matchNames.some(n => it.name.toLowerCase().includes(n.toLowerCase())));
    if (titleHit || items.length) {
      hits.push({ date: reportDate(r), year: reportYear(r), items, titleHit });
    }
  });
  return hits.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// HP 专用：判断是否"连续3年阴性可停"。返回 { done, lastDate, canStop, needCheck, reason }
// 阴性判断：reportItem.status==='normal' 或 value/结论含"阴性/(-)/negative"
function evalHp(reports, matchNames) {
  const records = findDoneRecords(reports, matchNames);
  if (!records.length) {
    return { done: false, needCheck: true, reason: '未见幽门螺杆菌检测记录，建议检测（碳13/14呼气试验）' };
  }
  const isNeg = (rec) => rec.items.some(it => {
    const v = `${it.value || ''}${it.diagnosis || ''}${it.findings || ''}`;
    if (it.status === 'normal') return true;
    return /阴性|\(-\)|（-）|negative|neg/i.test(v);
  });
  // 按年份取每年是否有阴性记录
  const byYear = {};
  records.forEach(rec => { if (rec.year) byYear[rec.year] = byYear[rec.year] || isNeg(rec); });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const lastRec = records[0];
  // 连续3年（含最近年）都有阴性记录 → 可停
  const recent3 = years.slice(0, 3);
  const threeNeg = recent3.length >= 3 && recent3.every(y => byYear[y] === true) &&
                   (recent3[0] - recent3[2] <= 2 + 1); // 3个年份跨度合理
  if (threeNeg) {
    return { done: true, lastDate: lastRec.date, canStop: true,
             reason: `近3年（${recent3.slice().reverse().join('/')}）HP均为阴性，可暂停年度检测` };
  }
  const lastNeg = isNeg(lastRec);
  return {
    done: true, lastDate: lastRec.date, canStop: false, needCheck: !lastNeg || years.length < 3,
    reason: lastNeg
      ? `最近一次（${(lastRec.date || '').slice(0,10)}）HP阴性，但尚无连续3年阴性记录，建议继续每年检测`
      : `最近一次（${(lastRec.date || '').slice(0,10)}）HP阳性，建议评估根除治疗后复查`,
  };
}

// 判断单个检查项是否"做过"（近N年内，默认看全部历史但优先报告最近一次）
function isProjDone(reports, proj) {
  const recs = findDoneRecords(reports, proj.matchNames);
  return recs.length ? { done: true, lastDate: recs[0].date } : { done: false };
}

// 评估单个肿瘤的覆盖度
function evalCancer(cancerKey, rule, ctx) {
  const { reports, age } = ctx;
  const result = { key: cancerKey, label: rule.label, status: 'ok', doneItems: [], missingItems: [], notes: [] };

  // gold 金标准判定
  let goldList = rule.gold || [];
  // 乳腺钼靶年龄规则：40岁以下不强制钼靶（超声达标即可）；40岁以上超声+钼靶都要（requireAll）
  let ageRequireAll = false;
  if (rule.ageRule === 'breast_mammo_over40') {
    if (age != null && age < 40) {
      goldList = goldList.filter(g => g.key !== 'mammography');
      result.notes.push('未满40岁，乳腺超声达标即可，钼靶暂不强制');
    } else {
      ageRequireAll = true; // 40岁以上（或年龄未知按保守）：超声+钼靶都需做
    }
  }

  const goldDone = [];
  const goldMissing = [];
  goldList.forEach(g => {
    const d = isProjDone(reports, g);
    if (d.done) { goldDone.push(g); result.doneItems.push(`${g.label}(${(d.lastDate || '').slice(0,10)})`); }
    else goldMissing.push(g);
  });

  const requireAll = !!rule.requireAll || ageRequireAll;
  const goldCovered = requireAll ? (goldMissing.length === 0 && goldList.length > 0)
                                 : (goldDone.length > 0);

  if (!goldCovered) {
    // 金标准未达标 → 看替代项是否做了
    goldMissing.forEach(g => result.missingItems.push(g.label));
    if (!goldDone.length && rule.alternate && rule.alternate.length) {
      const altDone = rule.alternate.filter(a => isProjDone(reports, a).done);
      if (altDone.length) {
        result.status = 'partial';
        result.notes.push(`已做初筛项（${altDone.map(a => a.label).join('、')}），但金标准（${goldMissing.map(g => g.label).join('、')}）未做，建议补做以完整覆盖`);
      } else {
        result.status = 'missing';
      }
    } else {
      result.status = requireAll && goldDone.length ? 'partial' : 'missing';
    }
  } else {
    result.status = 'ok';
    // 金标准做了 → 提示替代项可免做（金娟口径：胃镜免胃蛋白酶原、肠镜免便潜血）
    if (rule.alternate && rule.alternate.length) {
      result.notes.push(`已做金标准（${goldDone.map(g => g.label).join('、')}），${rule.alternate.map(a => a.label).join('、')}可不作为常规复查项`);
    }
  }

  // special 独立规则（HP）
  (rule.special || []).forEach(sp => {
    if (sp.rule === 'independent_yearly_stop_after_3neg') {
      const hp = evalHp(reports, sp.matchNames);
      result.notes.push(`【${sp.label}】${hp.reason}`);
      if (hp.needCheck) {
        if (result.status === 'ok') result.status = 'partial';
        result.missingItems.push(`${sp.label}(需检测/复查)`);
      }
    }
  });

  if (rule.note) result.ruleNote = rule.note;
  return result;
}

// 主入口：评估该患者所有适用肿瘤的覆盖度
function assessCancerCoverage(user, reports) {
  const genderF = user.gender === '女';
  const age = user.age != null ? Number(user.age) : null;
  const ctx = { reports: reports || [], age };

  const results = [];
  for (const [key, rule] of Object.entries(CANCER_RULES)) {
    if (rule.gender === 'M' && genderF) continue;
    if (rule.gender === 'F' && !genderF) continue;
    results.push(evalCancer(key, rule, ctx));
  }
  return results;
}

// 拼「肿瘤筛查覆盖度」文本（供 AI prompt）——把规则化结论喂给 AI，让它组织成通顺建议
function buildCoverageText(results) {
  if (!results.length) return '无适用的肿瘤筛查项';
  const STATUS_LABEL = { ok: '✓已覆盖', partial: '△部分覆盖', missing: '✗未筛查' };
  return results.map(r => {
    const lines = [`${STATUS_LABEL[r.status] || r.status} ${r.label}`];
    if (r.doneItems.length) lines.push(`  已做：${r.doneItems.join('、')}`);
    if (r.missingItems.length) lines.push(`  待补：${r.missingItems.join('、')}`);
    if (r.notes.length) r.notes.forEach(n => lines.push(`  · ${n}`));
    return lines.join('\n');
  }).join('\n');
}

module.exports = { assessCancerCoverage, buildCoverageText, evalHp };
