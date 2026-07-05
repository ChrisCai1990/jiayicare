// 心理健康标准量表定义（题目/选项/分级为国际通用标准，不可自定义修改）

const OPTIONS_4 = [
  { label: '完全不会', score: 0 },
  { label: '好几天', score: 1 },
  { label: '一半以上的天数', score: 2 },
  { label: '几乎每天', score: 3 },
];

const PHQ9 = {
  type: 'phq9',
  name: 'PHQ-9 患者健康问卷（抑郁症筛查）',
  intro: '在过去两周内，以下问题困扰您的频率有多少？',
  questions: [
    '做事时提不起劲或没有兴趣',
    '感到心情低落、沮丧或绝望',
    '入睡困难、睡不安稳或睡眠过多',
    '感觉疲倦或没有活力',
    '食欲不振或吃太多',
    '觉得自己很糟糕，或觉得自己很失败，或让自己或家人失望',
    '对事物专注有困难，例如阅读报纸或看电视时',
    '动作或说话速度缓慢到别人已经察觉？或正好相反——烦躁或坐立不安、动来动去的情况更胜于平常',
    '有不如死掉或用某种方式伤害自己的念头',
  ],
  options: OPTIONS_4,
  severityRanges: [
    { max: 4,  label: '无/极轻微' },
    { max: 9,  label: '轻度' },
    { max: 14, label: '中度' },
    { max: 19, label: '中重度' },
    { max: 27, label: '重度' },
  ],
};

const GAD7 = {
  type: 'gad7',
  name: 'GAD-7 广泛性焦虑量表',
  intro: '在过去两周内，以下问题困扰您的频率有多少？',
  questions: [
    '感觉紧张、焦虑或急切',
    '不能停止或控制担忧',
    '对各种各样的事情担忧过多',
    '很难放松下来',
    '由于不安而无法静坐',
    '变得容易烦恼或急躁',
    '感到似乎将有可怕的事情发生而害怕',
  ],
  options: OPTIONS_4,
  severityRanges: [
    { max: 4,  label: '无/极轻微' },
    { max: 9,  label: '轻度' },
    { max: 14, label: '中度' },
    { max: 21, label: '重度' },
  ],
};

const SCALES = { phq9: PHQ9, gad7: GAD7 };

function calcSeverity(scaleType, totalScore) {
  const scale = SCALES[scaleType];
  if (!scale) return '未知';
  const range = scale.severityRanges.find(r => totalScore <= r.max);
  return range ? range.label : scale.severityRanges[scale.severityRanges.length - 1].label;
}

module.exports = { SCALES, calcSeverity };
