const PEDIATRIC_BODY_COMPOSITION_PROMPT = `\n\n【未满18岁儿童人体成分专项提取（优先级最高）】
当前受检者未满18岁。本页必须使用儿童规则，禁止套用成人“体脂率/骨骼肌/内脏脂肪”四项规则。
只提取体成分构成区域明确印刷的以下五项，其他项目一律不输出：体重、钙质、蛋白质、脂肪量、肌肉量。
0. 先沿每张卡片到中央图标旁中文标签的连线定位项目，再读取数值，严禁顺着数值猜项目名。此类儿童报告的“体成分构成”卡片位置固定为：
   - 左列从上到下：体重、钙质、身体水分、基础代谢；
   - 右列从上到下：蛋白质、脂肪量、肌肉量、总能量消耗。
   目标中的钙质只能读左侧第二张卡，蛋白质只能读右侧第一张卡，脂肪量只能读右侧第二张卡，肌肉量只能读右侧第三张卡。“身体水分”“基础代谢”“总能量消耗”必须忽略。
1. 每项各输出一条 itemType="data"，sourceSection="儿童人体成分分析"；name只能为“体重”“钙质”“蛋白质”“脂肪量”“肌肉量”。
2. value读取该项目卡片/同行的实测值，unit统一为kg；referenceRange读取同一项目卡片/同行明确印刷的下限和上限。不得借用相邻项目、页眉体重或成人柱状图数据。
3. 每项必须增加sourceRow，按“项目名 实测值 下限 上限”抄写原图局部文字。sourceRow必须同时包含项目名和实测值；参考范围非空时，上下限也必须出现。
4. “脂肪量”不是“体脂率”，“肌肉量”不是“骨骼肌”；禁止改写成成人项目名。钙质也不得改写成骨量或骨骼肌。
   特别自查：不得把右侧第二张“脂肪量”的数值上移给蛋白质，不得把右侧第三张“肌肉量”的数值上移给脂肪量；左侧第三张是“身体水分”，不得当成肌肉量。
5. status根据本次实测值与报告参考范围判断：范围内normal，范围外abnormal；看不清的字段留空，不得推算。
输出前必须逐张点名复核五项，不能读取三项后提前结束：体重=左一、钙质=左二、蛋白质=右一、脂肪量=右二、肌肉量=右三。报告中确实缺失或无法看清的项目可以不输出，但必须先检查对应位置；不得用左三身体水分、左四基础代谢、右四总能量消耗或成人项目补足。`;

const text = value => String(value == null ? '' : value).trim();

function pediatricBodyCompositionKind(name) {
  const normalized = text(name).replace(/\s+/g, '');
  if (/^(?:体重|weight)$/i.test(normalized)) return 'weight';
  if (/^(?:钙质|钙量|calcium)$/i.test(normalized)) return 'calcium';
  if (/^(?:蛋白质|蛋白量|protein)$/i.test(normalized)) return 'protein';
  if (/^(?:脂肪量|体脂肪量|bodyfatmass)$/i.test(normalized)) return 'fatMass';
  if (/^(?:肌肉量|musclemass)$/i.test(normalized)) return 'muscleMass';
  return '';
}

function normalizeReference(referenceRange) {
  const reference = text(referenceRange);
  const bounds = reference.match(/\d+(?:\.\d+)?/g) || [];
  return bounds.length >= 2 ? `[${bounds[0]}-${bounds[1]}]` : reference;
}

function calculatedStatus(value, referenceRange) {
  const measured = Number(text(value).match(/-?\d+(?:\.\d+)?/)?.[0]);
  const bounds = text(referenceRange).match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (!Number.isFinite(measured) || bounds.length < 2) return 'unknown';
  return measured >= bounds[0] && measured <= bounds[1] ? 'normal' : 'abnormal';
}

function validPediatricBodyCompositionItem(item, requireEvidence = false) {
  const kind = pediatricBodyCompositionKind(item?.name);
  if (!kind || !text(item?.value)) return false;
  const unit = text(item?.unit).toLowerCase();
  if (unit && !/^(?:kg|千克|公斤)$/.test(unit)) return false;
  if (!requireEvidence) return true;
  const source = text(item.sourceRow || item.sourceEvidence || item.rawRow);
  if (!source) return false;
  const compact = source.replace(/[\s，,：:；;（）()\[\]【】]/g, '').toLowerCase();
  const labelPatterns = {
    weight: /体重|weight/i,
    calcium: /钙质|钙量|calcium/i,
    protein: /蛋白质|蛋白量|protein/i,
    fatMass: /脂肪量|体脂肪量|bodyfatmass/i,
    muscleMass: /肌肉量|musclemass/i,
  };
  if (!labelPatterns[kind].test(compact)) return false;
  const valueToken = text(item.value).replace(/\s+/g, '').toLowerCase();
  if (!compact.includes(valueToken)) return false;
  const rangeNumbers = text(item.referenceRange).match(/\d+(?:\.\d+)?/g) || [];
  return rangeNumbers.every(number => compact.includes(number));
}

function sanitizePediatricBodyCompositionPage(items, requireEvidence = false) {
  const seen = new Set();
  return (items || []).filter(item => {
    const kind = pediatricBodyCompositionKind(item.name);
    if (!kind || seen.has(kind) || !validPediatricBodyCompositionItem(item, requireEvidence)) return false;
    seen.add(kind);
    const names = { weight: '体重', calcium: '钙质', protein: '蛋白质', fatMass: '脂肪量', muscleMass: '肌肉量' };
    item.name = names[kind];
    item.itemType = 'data';
    item.sourceSection = '儿童人体成分分析';
    item.unit = 'kg';
    item.referenceRange = normalizeReference(item.referenceRange);
    const status = calculatedStatus(item.value, item.referenceRange);
    if (status !== 'unknown') item.status = status;
    return true;
  });
}

function mergePediatricBodyCompositionRetry(originalItems, retryItems) {
  const adultOrChildBodyComposition = /^(?:体重|weight|钙质|钙量|calcium|蛋白质|蛋白量|protein|脂肪量|体脂肪量|bodyfatmass|肌肉量|musclemass|体脂(?:肪)?率|pbf|骨骼肌(?:量)?|smm|内脏脂肪(?:等级|指数|面积)?)$/i;
  const retained = (originalItems || []).filter(item => !adultOrChildBodyComposition.test(text(item.name).replace(/\s+/g, '')));
  const evidenceBacked = (retryItems || []).filter(item => validPediatricBodyCompositionItem(item, true));
  return retained.concat(sanitizePediatricBodyCompositionPage(evidenceBacked, true));
}

function isPediatricAge(age) {
  const number = Number(age);
  return Number.isFinite(number) && number >= 0 && number < 18;
}

module.exports = {
  PEDIATRIC_BODY_COMPOSITION_PROMPT,
  isPediatricAge,
  pediatricBodyCompositionKind,
  validPediatricBodyCompositionItem,
  sanitizePediatricBodyCompositionPage,
  mergePediatricBodyCompositionRetry,
};
