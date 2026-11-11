// Geometry-only table transcription from a locally executed OCR engine.
// It produces review candidates, never verified clinical results.
const RESULT_TEXT = /^(?:[<>≤≥]?[+-]?\d+(?:[.,]\d+)?|阴性|阳性|弱阳性|黄色|黄|清亮|浑浊|无色|淡黄|透明|未见|正常|0-\d+)(?:\s*(?:H|L|↑|↓))?$/i;
const MARKER = /^(?:H|L|↑|↓)$/i;
const BAD_NAME = /^(?:名称|项目名称|结果|参考范围|备注|报告人|报告时间|姓名|检查|检验)$/;

function centerY(row) {
  const points = row.box || [];
  return points.length ? points.reduce((sum, point) => sum + Number(point[1]), 0) / points.length : Number(row.y);
}

function normalizeRows(rows) {
  return (rows || []).map(row => ({ ...row, x: Number(row.x ?? Math.min(...row.box.map(p => p[0]))),
    y: centerY(row), text: String(row.text || '').trim(), score: Number(row.score) }))
    .filter(row => Number.isFinite(row.x) && Number.isFinite(row.y) && row.text);
}

function cleanName(text) {
  return text.replace(/\s+/g, '').replace(/^[『【\[(]+|[』】\])]+$/g, '').trim();
}

function resultValue(text) {
  const parts = String(text).trim().split(/\s+/).filter(Boolean);
  const markers = parts.filter(part => MARKER.test(part));
  const values = parts.filter(part => !MARKER.test(part));
  if (values.length !== 1 || !RESULT_TEXT.test(values[0])) return null;
  return { value: values[0], status: markers.length ? 'abnormal' : 'unknown' };
}

function parseColumn(rows, { x0, width, headings, sourcePage }) {
  const local = rows.filter(row => row.x >= x0 && row.x < x0 + width);
  const nameEnd = x0 + width * 0.43;
  const valueEnd = x0 + width * 0.58;
  // OCR occasionally fuses a long analyte name, abnormal marker and result
  // into one box. Split only an explicit trailing marker + numeric result.
  for (const word of [...local]) {
    if (word.x >= nameEnd) continue;
    const inline = word.text.match(/^(.+?)\s+(H|L|↑|↓)\s*([<>]?[+-]?\d+(?:\.\d+)?)$/i);
    if (!inline) continue;
    word.text = inline[1].trim();
    local.push({ ...word, x: x0 + width * 0.5, text: `${inline[2]} ${inline[3]}`, _inlineValue: true });
  }
  const values = local.filter(row => row.x >= nameEnd && row.x < valueEnd && resultValue(row.text))
    .sort((a, b) => a.y - b.y);
  const out = [];
  for (let index = 0; index < values.length; index++) {
    const row = values[index];
    const before = index ? (values[index - 1].y + row.y) / 2 : row.y - 70;
    const after = index + 1 < values.length ? (row.y + values[index + 1].y) / 2 : row.y + 70;
    const names = local.filter(word => word.x < nameEnd && word.y >= before && word.y < after
      && Math.abs(word.y - row.y) <= 80 && !/^(?:『|【)/.test(word.text) && !BAD_NAME.test(word.text))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const name = cleanName(names.map(word => word.text).join(''));
    if (!name || name.length < 2 || BAD_NAME.test(name) || !/[\u4e00-\u9fffA-Za-z]/.test(name)) continue;
    const references = local.filter(word => word.x >= valueEnd && word.y >= before && word.y < after
      && Math.abs(word.y - row.y) <= 80 && !BAD_NAME.test(word.text)).sort((a, b) => a.y - b.y || a.x - b.x);
    const heading = [...headings].reverse().find(h => h.y < row.y);
    const parsed = resultValue(row.text);
    const explicitMarker = local.some(word => word.x >= nameEnd && word.x < valueEnd
      && MARKER.test(word.text) && Math.abs(word.y - row.y) < 24);
    out.push({ name, value: parsed.value, referenceRange: references.map(word => word.text).join(' ').trim(),
      status: parsed.status === 'abnormal' || explicitMarker ? 'abnormal' : 'unknown',
      itemType: 'lab', manualReviewStatus: 'pending', sourcePage, sourceSection: heading?.text || '',
      sourceSectionOrder: heading?.order || null, examDate: heading?.date || '',
      _ocr: { x: row.x, y: row.y, score: row.score, inlineValue: Boolean(row._inlineValue) } });
  }
  return out;
}

function parseScannedLabTable(rows, { width, sourcePage }) {
  if (!Number.isFinite(width) || width < 200 || !Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('扫描表格尺寸或页码无效');
  const words = normalizeRows(rows);
  const headingWords = words.filter(row => /^[『【].{3,}/.test(row.text))
    .map(row => ({ y: row.y, text: row.text.replace(/^[『【]|[』】]$/g, '') }))
    .sort((a, b) => a.y - b.y || b.text.length - a.text.length);
  const headings = [];
  for (const word of headingWords) {
    const previous = headings[headings.length - 1];
    if (previous && Math.abs(previous.y - word.y) < 20) {
      if (word.text.length > previous.text.length) previous.text = word.text;
    } else headings.push({ ...word, order: headings.length + 1 });
  }
  const reportDates = words.flatMap(row => {
    const match = row.text.match(/报告时间\s*[：:]?\s*(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,4})(?::\d{2})?/);
    if (!match) return [];
    // The scanner often fuses a one-digit day and a two-digit hour: 8/310:56.
    const rawDay = match[3];
    const day = rawDay.length >= 3 && /:\d{2}/.test(row.text.slice(match.index + match[0].length - 3))
      ? rawDay.slice(0, -2) : rawDay;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(day)));
    if (!Number(day) || date.getUTCFullYear() !== Number(match[1])
      || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(day)) return [];
    return [{ y: row.y, date: `${match[1]}-${match[2].padStart(2, '0')}-${day.padStart(2, '0')}` }];
  });
  headings.forEach((heading, index) => {
    const nextY = headings[index + 1]?.y ?? Infinity;
    heading.date = reportDates.find(row => row.y > heading.y && row.y < nextY)?.date || '';
  });
  const split = width * 0.47;
  const items = [
    ...parseColumn(words.filter(row => row.side === 'left'), { x0: 0, width: split, headings, sourcePage }),
    ...parseColumn(words.filter(row => row.side === 'right'), { x0: split, width: width - split, headings, sourcePage }),
  ].sort((a, b) => a._ocr.y - b._ocr.y || a._ocr.x - b._ocr.x);
  return items.map((item, index) => ({ ...item, sourceRowOrder: index + 1 }));
}

module.exports = { parseScannedLabTable, resultValue };
