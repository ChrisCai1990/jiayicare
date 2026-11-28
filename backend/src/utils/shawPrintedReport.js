// Only use the printed report format when its own footer identifies the section.
// Unknown layouts stay on the existing OCR path.
const footer = /邵逸夫医院体检报告\s*\[([^\]]+)\]\s*Page\s*\d+\s*\/\s*\d+/i;
const end = /^(?:备注\s*[:：]|检查医生\s*[:：]|报告人\s*[:：]|报告时间\s*[:：])/;
const department = /^(?:眼科|耳鼻喉科?|口腔科?|牙科|妇科|内科|外科|全科医学)(?:体检|检查)?$/;
const title = /^【(.+)】$/;
const testTitle = /『([^』]+)』/g;
const reportHeader = /报告部[份分]|体检报告编号|体检号|病历号|病人基本登记信息/;
const imaging = (name, findings, diagnosis = '') => ({
  name,
  itemType: 'imaging',
  findings,
  diagnosis,
  status: 'unknown',
});

function physical(lines, previous) {
  let section = '';
  const items = [];
  let body = [];
  const flush = () => {
    if (body.length) items.push({ ...imaging(section, body.join('\n')), sourceSection: section });
    body = [];
  };
  const previousHeading = [...previous.matchAll(/【([^】]+)】/g)].at(-1)?.[1];
  // A continuation must have an open department in the preceding printed page.
  if (
    /^三A、/.test(previous.match(footer)?.[1] || '') &&
    previousHeading &&
    department.test(previousHeading) &&
    !/检查医生\s*[:：]/.test(previous.slice(previous.lastIndexOf('】')))
  )
    section = previousHeading;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[-─]+$/.test(line)) continue;
    if (end.test(line)) {
      flush();
      section = '';
      continue;
    }
    const heading = line.match(title);
    if (heading) {
      flush();
      section = heading[1];
      if (!department.test(section) && !/^一般项目/.test(section)) return null;
      continue;
    }
    if (!section || reportHeader.test(line)) continue;
    if (/登记信息|联系地址|体检编号|姓名[:：]/.test(line)) return null;
    if (department.test(section)) {
      body.push(line.replace(/\s{2,}/g, '　'));
      continue;
    }
    const pair = line.match(/^(.+?)\s{2,}(.+)$/);
    if (!pair) return null;
    const field = pair[1].match(/^(.*?)[(（]([^()（）]+)[)）]$/);
    items.push({
      name: field?.[1] || pair[1],
      unit: field && !/^(BMI)$/i.test(field[2]) ? field[2] : '',
      value: pair[2],
      itemType: 'data',
      status: 'unknown',
      sourceSection: section,
    });
  }
  flush();
  return items.length ? items : null;
}

function ultrasoundParts(name, findings, diagnosis) {
  let rules;
  if (/腹部.*肝.*胆.*胰.*脾.*肾/.test(name))
    rules = [
      [/^肝(?:脏|外形|形态|实质)/, '肝脏超声'],
      [/^胆囊/, '胆囊超声'],
      [/^胰腺/, '胰腺超声'],
      [/^脾(?:脏|形态|大小|外形)/, '脾脏超声'],
      [/^(?:双|左|右)肾/, '双肾超声'],
    ];
  else if (/输尿管.*膀胱.*前列腺/.test(name))
    rules = [
      [/^(?:(?:双侧|双肾|双)?输尿管|双肾|膀胱)/, /肾/.test(name) ? '双肾输尿管膀胱超声' : '输尿管膀胱超声'],
      [/^前列腺/, '前列腺超声'],
    ];
  else if (/甲状腺.*淋巴结/.test(name))
    rules = [
      [/^甲状腺/, '甲状腺超声'],
      [/^(?:双侧|左侧|右侧)?颈部/, '颈部淋巴结超声'],
    ];
  if (!rules) return [imaging(name, findings, diagnosis)];
  const parts = new Map();
  let active;
  for (const line of findings.split('\n')) {
    const match = rules.find(([pattern]) => pattern.test(line));
    if (match) active = match[1];
    if (!active) return null;
    parts.set(active, (parts.get(active) || '') + line);
  }
  if (parts.size !== rules.length) return null;
  const rows = [...parts].map(([part, text]) => imaging(part, text));
  // Preserve combined conclusions verbatim with their printed scope.
  for (const sentence of diagnosis.split(/(?<=[；;。])/).filter(Boolean)) {
    const targets = rows.filter((row) => {
      const organ = row.name
        .replace(/超声$/, '')
        .replace(/^双肾$/, '肾')
        .replace(/^肝脏$/, '肝')
        .replace(/^颈部淋巴结$/, '淋巴结');
      return organ === '输尿管膀胱' ? /输尿管|膀胱/.test(sentence) : sentence.includes(organ);
    });
    if (targets.length === 1) targets[0].diagnosis += sentence;
    else
      for (const row of targets.length ? targets : rows) {
        row.diagnosis += name + '（联合结论）：' + sentence;
      }
  }
  return rows;
}

function exams(lines) {
  const items = [];
  let name = '',
    reading = false,
    finished = true,
    findings = [],
    diagnosis = [];
  function flush() {
    if (!name) return true;
    if (!reading || !(findings.length || diagnosis.length)) return false;
    const parts = ultrasoundParts(name, findings.join('\n'), diagnosis.join(''));
    if (!parts) return false;
    for (const part of parts) items.push({ ...part, sourceSection: name, orderName: name });
    return true;
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[-─]+$/.test(line)) continue;
    if (line.startsWith('【')) {
      if (!flush()) return null;
      name = line.slice(1).replace(/】$/, '');
      finished = line.endsWith('】');
      reading = false;
      findings = [];
      diagnosis = [];
      continue;
    }
    if (!finished) {
      name += line.replace(/】$/, '');
      finished = line.endsWith('】');
      continue;
    }
    if (end.test(line)) {
      if (!flush()) return null;
      name = '';
      reading = false;
      continue;
    }
    if (/检查所见\s+诊断结论/.test(line)) {
      reading = true;
      continue;
    }
    if (!reading) continue;
    if (/^\s{15,}\S/.test(raw)) {
      diagnosis.push(line);
      continue;
    }
    const pair = line.split(/\s{2,}/);
    if (pair.length > 2) return null;
    findings.push(pair[0]);
    if (pair[1]) diagnosis.push(pair[1]);
  }
  return flush() && items.length ? items : null;
}

// This specific print template uses two copies of the same three-column grid.
// Verify the header coordinates before using its physical cell boundaries.
function labs(layout, boxes, previous) {
  const sections = [...layout.matchAll(testTitle)]
    .map((m) => m[1].replace(/\s+/g, ''))
    .filter((s) => !reportHeader.test(s));
  const words = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const headers = words.filter((w) => w.text === '名称' && Math.abs(w.x - 48) < 2);
  if (!headers.length || headers.length !== sections.length) return null;
  const items = [];
  const tables = headers.map((header, i) => ({ y: header.y, name: sections[i] }));
  const previousName = [...previous.matchAll(testTitle)].at(-1)?.[1];
  const firstFooter = words.find((w) => /^(?:备注|报告人|检查医生)[:：]/.test(w.text));
  if (firstFooter && firstFooter.y < headers[0].y) {
    if (!previousName || !/^三C、/.test(previous.match(footer)?.[1] || '')) return null;
    const firstResult = words.find((w) => Math.abs(w.x - 150.5) < 2 && w.y < firstFooter.y);
    if (!firstResult) return null;
    tables.unshift({ y: firstResult.y - 9, name: previousName.replace(/\s+/g, ''), continued: true });
  }
  for (const [index, table] of tables.entries()) {
    if (
      !table.continued &&
      ![
        ['结果', 162],
        ['参考范围', 216],
      ].every(([label, x]) =>
        words.some((w) => Math.abs(w.y - table.y) < 2 && Math.abs(w.x - x) < 2 && w.text === label)
      )
    )
      return null;
    const stop = words.find(
      (w) => w.y > table.y && /^(?:备注|报告人|检查医生)[:：]|邵逸夫医院体检报告/.test(w.text)
    );
    if (!stop || stop.y > (tables[index + 1]?.y ?? Infinity)) return null;
    const body = words.filter((w) => w.y > table.y + 2 && w.y < stop.y - 2);
    for (const offset of [0, 270]) {
      const side = body.filter((w) => w.x >= 22 + offset && w.x < 292 + offset);
      const anchors = side.filter(
        (w) => Math.abs(w.x - 150.5 - offset) < 2 && !/^[（(](?:阴性|阳性|弱阳性)[)）]$/.test(w.text)
      );
      if (side.length && !anchors.length) return null;
      for (const [i, anchor] of anchors.entries()) {
        const top = i ? (anchors[i - 1].y + anchor.y) / 2 : -Infinity;
        const bottom = i + 1 < anchors.length ? (anchors[i + 1].y + anchor.y) / 2 : Infinity;
        const row = side.filter((w) => w.y >= top && w.y < bottom);
        const cell = (min, max) =>
          row
            .filter((w) => w.x >= min + offset && w.x < max + offset)
            .map((w) => w.text)
            .join('');
        const marker = row.find((w) => w.x - offset > 100 && w.x - offset < 150 && /^[HL↑↓]$/.test(w.text));
        const name = row
          .filter((w) => w !== marker && w.x < 139 + offset)
          .map((w) => w.text)
          .join('');
        const result = cell(139, 201),
          referenceRange = cell(201, 292);
        if (!name || !result) return null;
        if (/^【.*】$/.test(name) && /^[.．。]$/.test(result)) continue;
        const flag = result.match(/^([HL↑↓])(?=[<>≤≥+-]?\d)/);
        const unit =
          referenceRange.match(/(%|(?:[x×]10\^\d+\/|[a-zA-Zμµ][a-zA-Zμµ.]*\/)[\wμµ^·肌酐]+|fL|pg)$/i)?.[0] ||
          '';
        const range = unit ? referenceRange.slice(0, -unit.length) : referenceRange;
        items.push({
          name,
          value: flag ? result.slice(1) : result,
          referenceRange: range,
          unit,
          status: flag || marker ? 'abnormal' : 'unknown',
          sourceSection: table.name,
          orderName: table.name,
          itemType: 'lab',
        });
      }
    }
  }
  return items.length ? items : null;
}

async function readPrintedPage(pdf, page, api) {
  const layout = await api.readPdfPageLayout(pdf, page);
  const part = layout.match(footer)?.[1] || '';
  if (/^二、体检小结内容$/.test(part)) return { skip: true, items: [] };
  if (!/^三[ABC]、体检/.test(part)) return null;
  const lines = layout.split(footer)[0].split(/\r?\n/);
  const previous = page > 1 && !part.startsWith('三B') ? await api.readPdfPageLayout(pdf, page - 1) : '';
  let items;
  if (part.startsWith('三A')) items = physical(lines, previous);
  else if (part.startsWith('三B')) items = exams(lines);
  else items = labs(layout, await api.readPdfPageTextBoxes(pdf, page), previous);
  if (!items) return null;
  const sections = new Map();
  return {
    items: items.map((row, i) => {
      if (!sections.has(row.sourceSection)) sections.set(row.sourceSection, sections.size + 1);
      return {
        ...row,
        sourcePage: page,
        sourceSectionOrder: sections.get(row.sourceSection),
        sourceRowOrder: i + 1,
      };
    }),
  };
}

module.exports = { readPrintedPage };
