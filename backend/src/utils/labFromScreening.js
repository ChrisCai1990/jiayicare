// 从专项筛查报告（MedicalReport.reportItems）派生「体检关键指标」真实数值 + 历年趋势。
//
// 背景（2026-07-10）：AI健康分析/风险评估此前的「体检关键指标」立足点读的是 user.labValues——
// 一套需要医护单独手动录入的字段，绝大多数患者几乎为空（如金娟名下患者只有 tc 一个值、labHistory 0 条），
// 导致 AI 拿不到真实数值只能脑补，"提取数据没一次对的"、每次重生成结果差异巨大。
// 患者真实的体检数值全在专项筛查报告的 reportItems 里（上百条带 value）。本模块把这些数值按同一套
// 别名规则提取出来，与医护端「体检关键指标」卡片（staff/PatientDetailPage.jsx）使用完全一致的匹配逻辑，
// 保证 AI 看到的数值 = 医护端页面上看到的数值。

// key → 匹配别名。每项可为 string[] 或 { names, exclude }。与前端 REPORT_KEY_MAP 保持同步。
const REPORT_KEY_MAP = {
  fpg:   ['空腹血糖', '空腹葡萄糖', 'GLU', 'FPG', 'Glu(空腹)', '血糖-0'],
  hba1c: ['糖化血红蛋白', 'HbA1c', 'HbA1C', 'HBA1C', 'HBA1c', 'HbA1c(%)'],
  tc:    ['总胆固醇', 'TC', 'CHOL', '胆固醇'],
  tg:    ['甘油三酯', 'TG', '三酰甘油', 'TRIG'],
  ldl:   ['低密度脂蛋白', 'LDL', 'LDL-C', 'LDL-胆固醇'],
  hdl:   ['高密度脂蛋白', 'HDL', 'HDL-C', 'HDL-胆固醇'],
  alt:   ['谷丙转氨酶', 'ALT', '丙氨酸转氨酶', '丙氨酸氨基转移酶'],
  ast:   ['谷草转氨酶', 'AST', '天冬氨酸转氨酶', '天冬氨酸氨基转移酶', '门冬氨酸转氨酶', '门冬氨酸氨基转移酶'],
  ggt:   ['γ-谷氨酰转肽酶', 'γ-谷氨酸转肽酶', 'GGT', 'γ-GT', 'γGT', '谷氨酸转肽酶'],
  ua:    { names: ['尿酸', 'UA', 'SUA'], exclude: ['结晶', '盐结晶'] },
  cr:    { names: ['血肌酐', '血清肌酐', '肌酐', 'CREA', 'SCr', 'S-Cr', '血Cr'], exclude: ['尿', 'U-', 'U肌酐', 'U-Cr'] },
  umalb: ['尿微量白蛋白', '尿微量蛋白', 'mAlb', 'MAU', '微量白蛋白', 'MALB'],
  egfr:  ['肾小球滤过率', 'eGFR', 'GFR', '估算肾小球滤过率'],
  hcy:   ['同型半胱氨酸', 'Hcy', 'HCY'],
  lpla2: ['Lp-PLA2', '脂蛋白磷脂酶A2', 'LPLA2'],
  sbp:   { names: ['收缩压', 'SBP', '收缩压(mmHg)'], exclude: ['下降率', '最大值', '最小值', '负荷', '标准差', '变异'] },
  dbp:   { names: ['舒张压', 'DBP', '舒张压(mmHg)'], exclude: ['下降率', '最大值', '最小值', '负荷', '标准差', '变异'] },
  weight:['体重', 'Weight', 'BW'],
};

// 展示用中文标签 + 单位（给 AI prompt 拼文本用）
const LAB_LABEL = {
  sbp: '血压', dbp: '舒张压', fpg: '空腹血糖', hba1c: '糖化血红蛋白', tc: '总胆固醇',
  tg: '甘油三酯', ldl: 'LDL-C', hdl: 'HDL-C', ua: '尿酸', cr: '血肌酐', egfr: 'eGFR',
  umalb: '尿微量白蛋白', alt: 'ALT', ast: 'AST', ggt: 'GGT', hcy: '同型半胱氨酸',
  lpla2: 'Lp-PLA2', weight: '体重',
};

function matchItem(reportItems, def) {
  const names = Array.isArray(def) ? def : def.names;
  const exclude = Array.isArray(def) ? [] : (def.exclude || []);
  return (reportItems || []).find(ri =>
    ri.name &&
    names.some(n => ri.name.toLowerCase().includes(n.toLowerCase())) &&
    !exclude.some(ex => ri.name.includes(ex))
  );
}

function reportDate(r) {
  return r.checkDate || r.date || r.createdAt || '';
}

// 从一组报告派生「最近一次」各指标真实值。
// reports: MedicalReport 数组（需含 reportItems / checkDate / reportYear / title）
// 返回 { latest: { key: { value, unit, date, source, abnormal, referenceRange } }, trend: { key: [{year,date,value}] } }
function deriveLabFromReports(reports) {
  const sorted = [...(reports || [])].sort((a, b) => new Date(reportDate(b)) - new Date(reportDate(a)));

  const latest = {};
  for (const [key, def] of Object.entries(REPORT_KEY_MAP)) {
    for (const report of sorted) {
      const item = matchItem(report.reportItems, def);
      if (item && item.value != null && String(item.value).trim() !== '') {
        latest[key] = {
          value: String(item.value).trim(),
          unit: item.unit || '',
          date: (reportDate(report) || '').toString().slice(0, 10),
          source: report.screeningL2 || report.title || '专项筛查',
          abnormal: item.status === 'abnormal',
          referenceRange: item.referenceRange || '',
        };
        break;
      }
    }
  }

  // 血压复合格式 "124/75" 兜底
  ['sbp', 'dbp'].forEach((key, idx) => {
    if (latest[key]) return;
    for (const report of sorted) {
      const item = (report.reportItems || []).find(ri => ri.name === '血压' && /^\d+\s*\/\s*\d+/.test(ri.value || ''));
      if (item) {
        const parts = String(item.value).split('/').map(s => s.trim());
        latest[key] = { value: parts[idx], unit: item.unit || 'mmHg', date: (reportDate(report) || '').toString().slice(0, 10), source: report.title || '专项筛查', abnormal: false, referenceRange: '' };
        break;
      }
    }
  });

  // 历年趋势：每个 key 收集所有报告里的历次值（旧→新），带年份
  const trend = {};
  for (const [key, def] of Object.entries(REPORT_KEY_MAP)) {
    const pts = [];
    [...sorted].reverse().forEach(report => {
      const item = matchItem(report.reportItems, def);
      if (item && item.value != null && parseFloat(item.value)) {
        const d = reportDate(report);
        const dt = d ? new Date(d) : null;
        pts.push({
          year: dt ? dt.getFullYear() : null,
          date: d ? d.toString().slice(0, 10) : '',
          value: parseFloat(item.value),
        });
      }
    });
    if (pts.length) trend[key] = pts;
  }

  return { latest, trend };
}

// 拼「最近一次体检关键指标」文本（供 AI prompt）
function buildLatestLabText(latest) {
  const lines = Object.entries(latest).map(([key, v]) => {
    if (key === 'dbp') return null; // 血压合并到 sbp 一行
    const label = LAB_LABEL[key] || key;
    if (key === 'sbp') {
      const dia = latest.dbp ? `/${latest.dbp.value}` : '';
      return `血压 ${v.value}${dia} mmHg${v.abnormal ? '（异常）' : ''}（${v.date}）`;
    }
    return `${label} ${v.value}${v.unit ? ' ' + v.unit : ''}${v.abnormal ? '（异常）' : ''}（${v.date}）`;
  }).filter(Boolean);
  return lines.join('、') || '暂无可提取的体检数值（专项筛查报告中未识别到标准检验指标）';
}

// 拼「历年趋势」文本（供 AI prompt）——只列有 2 个以上历史点的指标
function buildTrendText(trend) {
  const lines = [];
  for (const [key, pts] of Object.entries(trend)) {
    if (!pts || pts.length < 2) continue;
    const label = LAB_LABEL[key] || key;
    const series = pts.map(p => `${p.date || p.year}:${p.value}`).join(' → ');
    lines.push(`  ${label}：${series}`);
  }
  return lines.length ? lines.join('\n') : '  暂无足够历史数据比较趋势（单次或无匹配数值）';
}

// 把派生的 latest 转成 ruleEngineSignals 可消费的「伪 labValues」对象（key→字符串值），
// 让风险评估的规则引擎也基于专项筛查真实数值判断，而非空的 user.labValues
function latestToLabValues(latest) {
  const lv = {};
  for (const [key, v] of Object.entries(latest)) {
    lv[key] = v.value;
  }
  return lv;
}

// 常见肿瘤标志物名单（用于从报告中识别并单独成段分析）。
// 口径（金娟 2026-07-10）：除 PSA 对前列腺癌有相对特异性外，其余标志物特异性都不高——
// 单项轻度升高不代表患癌，须结合影像/内镜/动态趋势判断。此说明会写进 AI prompt 硬约束。
const TUMOR_MARKERS = ['AFP', 'CEA', 'CA19-9', 'CA199', 'CA125', 'CA153', 'CA15-3', 'CA724', 'CA72-4', 'CA242', 'CYFRA', 'NSE', 'SCC', 'HE4', 'PSA', 'fPSA', 'tPSA', 'ProGRP', '鳞状细胞癌', '糖类抗原', '糖链抗原', '癌胚抗原', '甲胎蛋白', '神经元特异', '细胞角蛋白', '附睾蛋白'];
// 排除易误命中的非肿瘤标志物项（转铁蛋白/尿液系列等）
const TUMOR_MARKER_EXCLUDE = ['转铁蛋白', '尿'];

// 提取肿瘤标志物的历年值（含正常项，供单独维度分析）。返回按标志物名分组的历次记录（旧→新）。
function extractTumorMarkers(reports) {
  const sorted = [...(reports || [])].sort((a, b) => new Date(reportDate(a)) - new Date(reportDate(b)));
  const byMarker = {};
  sorted.forEach(r => {
    const d = (reportDate(r) || '').toString().slice(0, 10);
    (r.reportItems || []).forEach(it => {
      const name = it.name || '';
      if (!name || it.value == null || String(it.value).trim() === '') return;
      if (TUMOR_MARKER_EXCLUDE.some(ex => name.includes(ex))) return;
      // 跳过AI把多个标志物合并成一个name的历史脏项（如"糖链抗原125/糖链抗原15-3/..."），
      // 这类value无法对应到具体标志物，进AI只会误导（金娟名下2025报告有此类合并项）
      const markerHitCount = TUMOR_MARKERS.filter(m => name.toLowerCase().includes(m.toLowerCase())).length;
      if (name.split('/').length >= 3) return;
      if (markerHitCount === 0) return;
      if (!byMarker[name]) byMarker[name] = [];
      byMarker[name].push({ date: d, value: String(it.value).trim(), unit: it.unit || '', abnormal: it.status === 'abnormal', ref: it.referenceRange || '' });
    });
  });
  return byMarker;
}

// 拼「肿瘤标志物」文本（单独维度，供 AI prompt）
function buildTumorMarkerText(byMarker) {
  const names = Object.keys(byMarker);
  if (!names.length) return '暂无肿瘤标志物检测记录';
  return names.map(name => {
    const pts = byMarker[name];
    const series = pts.map(p => `${p.date}:${p.value}${p.unit}${p.abnormal ? '(↑异常)' : ''}`).join(' → ');
    const ref = pts[pts.length - 1].ref;
    return `  ${name}：${series}${ref ? `（参考 ${ref}）` : ''}`;
  }).join('\n');
}

// 提取基因检测报告内容（供健康分析纳入）
function extractGeneticFindings(reports) {
  const lines = [];
  (reports || []).forEach(r => {
    const isGenetic = r.type === 'genetic' || (r.title || '').includes('基因');
    if (!isGenetic) return;
    const d = (reportDate(r) || '').toString().slice(0, 10);
    (r.reportItems || []).forEach(it => {
      if (it.name && (it.value || it.diagnosis || it.findings)) {
        lines.push(`  ${d} ${it.name}：${it.value || it.diagnosis || it.findings}`);
      }
    });
  });
  return lines.length ? lines.join('\n') : '暂无基因检测报告';
}

// 从所有报告的 diagnosis/conclusion/findings 文字里识别「明确异常的专科检查发现」，
// 单独成高优先级清单——解决"异常写在文字里但 status 没标 abnormal 就被 AI 忽略"的问题。
// 典型场景（金娟2026）：纯音听阈测试 diagnosis="右耳高频听力下降"、眼科 diagnosis="右眼屈光不正"，
// 这些 status 都是 unknown，此前不进异常清单，AI 分析看不到。覆盖听力/视力/眼耳鼻喉/口腔/骨密度/肺功能等所有专科。
const ABNORMAL_HINT = ['下降', '减退', '不正', '异常', '增生', '结节', '囊肿', '息肉', '钙化', '斑块', '狭窄', '肥大', '萎缩', '病变', '硬化', '肿大', '偏高', '偏低', '升高', '降低', '缺失', '龋', '牙周', '受损', '损伤', '障碍', '不足', '减低', '增厚', '积液', '炎', '阳性', '可疑', '肠化', '化生', '糜烂', '溃疡', '返流', '反流'];
// 明确正常的措辞——命中这些且不含异常词，判为正常，不进异常清单
const NORMAL_HINT = ['未见异常', '未见明显异常', '正常', '阴性', '未见明显', '无异常'];

function extractExamFindings(reports) {
  const sorted = [...(reports || [])].sort((a, b) => new Date(reportDate(b)) - new Date(reportDate(a)));
  const lines = [];
  const seen = new Set();
  sorted.forEach(r => {
    const d = (reportDate(r) || '').toString().slice(0, 10);
    (r.reportItems || []).forEach(it => {
      const dx = `${it.diagnosis || ''}`.trim();
      const cc = `${it.conclusion || ''}`.trim();
      const text = (dx || cc || '').replace(/^小结[:：]\s*/, '').trim();
      if (!text) return;
      // 先把"未见异常/未见明显异常/无异常/正常/阴性"这类正常措辞整体剔除，
      // 再判断剩余文字里有没有真正的异常词——避免"未见异常"里的"异常"被误判成异常（金娟耳鼻喉科"未见异常"曾误入）
      const residual = text
        .replace(/未见明显异常|未见异常|无异常|未见明显|未见/g, '')
        .replace(/正常|阴性/g, '');
      const hasAbn = ABNORMAL_HINT.some(k => residual.includes(k)) || (it.status === 'abnormal');
      if (!hasAbn) return;
      const key = `${it.name}|${text}`;
      if (seen.has(key)) return; // 同一异常发现只取最近一次
      seen.add(key);
      const fnd = `${it.findings || ''}`.trim().slice(0, 180);
      lines.push(`  [${d}] ${it.name || '检查'}：${text}${fnd ? `（所见：${fnd}）` : ''}`);
    });
  });
  return lines.length ? lines.join('\n') : '未见明确异常的专科检查发现';
}

module.exports = {
  REPORT_KEY_MAP,
  LAB_LABEL,
  TUMOR_MARKERS,
  extractExamFindings,
  deriveLabFromReports,
  buildLatestLabText,
  buildTrendText,
  latestToLabValues,
  extractTumorMarkers,
  buildTumorMarkerText,
  extractGeneticFindings,
};
