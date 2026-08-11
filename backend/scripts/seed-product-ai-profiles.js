require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const { normalizeAiProfile } = require('../src/utils/productAiProfile');

const apply = process.argv.includes('--apply');

const COMMON_LIMITS = ['不承诺诊断、治疗或健康改善效果', '不承诺第三方医院、专家、床位或检查资源结果'];
const COMMON_HANDOFF = ['客户要求诊断、治疗、处方或用药调整', '客户要求保证效果或第三方医疗资源', '商城资料不足以确认价格、城市或服务范围'];

function profile(targetNeeds, suitableFor, requiredQuestions, extra = {}) {
  return normalizeAiProfile({
    enabledForRecommendation: true,
    targetNeeds,
    suitableFor,
    requiredQuestions,
    notSuitableFor: ['存在紧急健康风险或需要即时医疗处置'],
    supportedCities: [],
    includedItems: [],
    excludedItems: ['商城未明确列出的第三方费用'],
    promiseLimits: COMMON_LIMITS,
    handoffConditions: COMMON_HANDOFF,
    nextAction: 'inquire',
    operatorNotes: '根据2026-08-12线上商城公开内容生成的第一版，地域、第三方费用和资源能力需运营复核。',
    ...extra,
  });
}

const PROFILES = {
  '医务代办服务': profile(['代配药流程协助', '预约检查', '预约门诊', '医院事务代办'], ['本人无法到场或希望节省医院事务办理时间的人'], ['需要代办什么事项？', '所在城市、医院和期望时间是什么？', '相关病案和必要材料是否齐全？']),
  '医疗代诊服务': profile(['复诊代诊', '检查后代诊', '本人无法到院但需要传达诉求'], ['已完成相关检查且符合代诊条件的人'], ['本次代诊希望解决什么问题？', '是否已有目标医院和专家？', '检查资料是否完整？'], { handoffConditions: [...COMMON_HANDOFF, '是否符合代诊条件无法确认'] }),
  '就医陪同服务': profile(['陪同门诊', '陪同检查', '为父母或家人安排陪诊'], ['需要单家机构半天就医陪同的人'], ['就医医院、科室和日期是什么？', '服务对象是谁？', '属于简单还是复杂陪同？'], { includedItems: ['单家机构半天陪同，上午或下午分别核算'], nextAction: 'book' }),
  '体检一站式服务': profile(['个性化体检规划', '全程陪检', '体检报告整理和解读'], ['希望减少体检遗漏并获得全流程协调的人'], ['服务对象年龄和主要健康关注是什么？', '是否已有体检机构或日期？', '是否有家族史或既往报告可供规划？']),
  '门诊一站式服务': profile(['多次就医流程压缩', '检查与专家门诊统筹', '复杂门诊流程协助'], ['需要检查、报告和专家门诊统筹安排的人'], ['主要就医诉求是什么？', '目标医院、科室或专家是否明确？', '已有检查资料有哪些？']),
  '住院一站式服务': profile(['住院流程协助', '床位与住院过程对接', '出院后复诊协助'], ['已进入住院就医阶段并需要全过程协调支持的人'], ['是否已有住院单或目标医院？', '常规还是特需需求？', '希望重点协调哪些环节？'], { nextAction: 'handoff', handoffConditions: [...COMMON_HANDOFF, '所有住院资源和床位需求均需真人确认'] }),
  '全专联合远程会诊': profile(['多专家意见统筹', '远程专家会诊服务咨询', '既有意见难以理解'], ['已有较完整病案资料且需要多专家共同分析的人'], ['希望会诊解决什么问题？', '现有病案资料是否完整？', '希望邀请哪些专业方向？'], { nextAction: 'handoff', promiseLimits: [...COMMON_LIMITS, 'AI不解释或替代专家会诊意见'] }),
  '体重管理服务': profile(['12周连续体重管理', '营养师陪伴减重', '改善超重和腰围'], ['商城标准所列无慢病且BMI、腰围或腰臀比符合条件的人'], ['是否有高血压、糖尿病或高血脂等慢病？', '身高、体重、腰围和性别是多少？', '是否愿意接受12周连续服务？'], { notSuitableFor: ['有高血压、糖尿病、高血脂等慢病且未经专业人员评估', '孕期、哺乳期、未成年人或疑似进食障碍', '存在紧急健康风险或需要即时医疗处置'], handoffConditions: [...COMMON_HANDOFF, '健康筛查结果不明确或不符合商城标准'] }),
  '健康预防计划': profile(['年度健康档案', '个性化体检规划', '全年复查提醒和健康咨询', '家庭健康管理'], ['每年体检、看不懂报告、容易忘记复查或希望家庭共同管理的人'], ['单人还是家庭使用？', '今年是否已有体检或报告？', '最希望长期管理什么问题？'], { nextAction: 'buy' }),
  '轻享健康计划': profile(['一次健康管理体验', '体成分和营养评估', '获得一次改善建议'], ['想先体验健康评估、营养分析和提醒服务的人'], ['是否已有体检报告？', '最希望改善健康指标还是体重？', '是否理解这是一次性体验服务？'], { nextAction: 'buy' }),
  '胃肠镜安心服务': profile(['胃肠镜开单预约流程协助', '清肠指导', '胃肠镜陪诊和检后支持'], ['已经计划进行胃肠镜检查并需要流程支持的人'], ['所在城市和目标医院是什么？', '需要常规、特需还是含陪诊的一站式服务？', '是否已经完成相关医疗评估？'], { handoffConditions: [...COMMON_HANDOFF, '检查适应性、麻醉或医疗风险问题'] }),
  '企业护航计划': profile(['企业员工体检与健康管理', '企业健康白皮书', '员工分层健康干预'], ['希望为员工建立年度健康管理体系的企业'], ['企业所在城市和员工人数？', '当前体检、健康管理和保障需求是什么？', '预计启动时间和预算范围？'], { nextAction: 'handoff', promiseLimits: [...COMMON_LIMITS, 'AI不解释、销售或承诺保险保障与理赔'] }),
  '健康护航计划': profile(['慢病或异常指标长期管理支持', '年度体检复查和就医路径规划', '家庭长期健康管理'], ['经常体检复查、有长期管理需求或希望减少就医焦虑的个人及家庭'], ['单人还是家庭使用？', '目前最主要的复查或健康管理需求是什么？', '是否已有健康档案和报告？']),
  '健康体检服务': profile(['体检方案设计', '体检陪同', '报告解读和建档'], ['第一次体检、体检升级、企业体检或有指标异常的人'], ['需要体检陪同还是完整健康体检服务？', '服务对象和所在城市？', '是否已有机构或体检日期？']),
  '体检报告解读服务': profile(['看懂体检报告', '异常指标梳理', '健康改善方向'], ['已有体检报告并希望获得专业解读的人'], ['报告日期和机构是什么？', '最关注哪些指标或结论？', '能否提供完整清晰报告？'], { nextAction: 'buy', promiseLimits: [...COMMON_LIMITS, '报告解读不等于疾病诊断'] }),
  '营养评估服务': profile(['身体组成分析', '饮食习惯评估', '个性化饮食建议'], ['希望了解营养状态并改善饮食结构的人'], ['主要营养目标是什么？', '是否有体成分数据或近期报告？', '是否有食物过敏、特殊饮食或慢病？']),
  '科学减重咨询': profile(['减重方法咨询', '饮食结构和热量分析', '制定阶段减重目标'], ['希望先了解适合自己的科学减重路径的人'], ['身高、体重、腰围和目标是什么？', '既往尝试过哪些方法？', '是否有慢病、孕哺或进食障碍风险？'], { notSuitableFor: ['孕期、哺乳期、未成年人或疑似进食障碍', '存在紧急健康风险或需要即时医疗处置'] }),
  '健康咨询服务': profile(['检查结果咨询', '就医和检查方向咨询', '日常健康指导'], ['希望通过人工健康咨询梳理下一步的人'], ['首次咨询还是后续咨询？', '本次最希望咨询什么？', '是否有相关报告或资料？'], { promiseLimits: [...COMMON_LIMITS, '咨询服务不替代线下诊疗'] }),
  '就医规划服务': profile(['医院科室选择', '就医路径规划', '就诊准备指导'], ['已有健康问题或检查资料，希望减少就医弯路的人'], ['目前已知情况和已有资料？', '所在城市及期望就医城市？', '是否已有目标医院或科室？'], { nextAction: 'inquire' }),
  '心理咨询服务': profile(['情绪压力疏导', '婚姻家庭或亲子关系支持', '职场与人际关系咨询', '个人成长'], ['希望接受专业心理咨询师一对一咨询的人'], ['希望重点讨论什么困扰？', '希望单次还是连续咨询？', '目前是否有自伤、伤人或即时危机？'], { notSuitableFor: ['存在自伤、伤人、严重精神异常或即时危机，需要紧急专业帮助'], handoffConditions: [...COMMON_HANDOFF, '存在任何心理危机信号或需要精神科评估'], nextAction: 'book' }),
  '心理健康陪伴': profile(['短时情绪陪伴', '压力疏导', '心理状态观察'], ['希望获得20至30分钟支持性交流的人'], ['目前最希望被倾听或支持的是什么？', '希望短时陪伴还是正式心理咨询？', '目前是否有自伤、伤人或即时危机？'], { notSuitableFor: ['存在自伤、伤人、严重精神异常或即时危机，需要紧急专业帮助'], handoffConditions: [...COMMON_HANDOFF, '存在任何心理危机信号或需要正式心理咨询/精神科评估'] }),
  '轻咨询计划': profile(['日常健康问题长期咨询', '报告术语基础理解', '复查和就医方向基础咨询', '长期保存健康资料'], ['有轻量、长期、日常健康咨询需求的人'], ['希望开通1个月还是1年？', '主要咨询报告、生活方式还是就医方向？', '是否理解不含报告人工审核、诊断和持续健康管理？'], { includedItems: ['健康档案', '服务期内图文轻咨询'], nextAction: 'buy' }),
  '专家约诊服务': profile(['指定专家预约', '不知道如何选择医院科室专家', '异地专家预约'], ['已有目标专家或需要先评估专家方向的人'], ['是否已有指定专家？', '目标城市、医院、科室和时间？', '是否需要先做需求评估？'], { promiseLimits: [...COMMON_LIMITS, '不保证指定专家、日期或号源一定预约成功'], nextAction: 'inquire' }),
  '其他城市服务咨询': profile(['异地就医协助可行性咨询', '异地营养指导咨询', '异地健康顾问咨询'], ['不在杭州或长三角、希望先确认当地服务能力的人'], ['所在城市？', '需要就医、营养还是健康顾问咨询？', '希望何时开始？'], { nextAction: 'buy', promiseLimits: [...COMMON_LIMITS, '支付咨询费不代表当地服务一定可执行'] }),
};

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare';
  await mongoose.connect(uri);
  const products = await Product.find({ name: { $in: Object.keys(PROFILES) } }).select('_id name aiProfile');
  const found = new Set(products.map(item => item.name));
  for (const product of products) {
    const next = PROFILES[product.name];
    console.log(`${apply ? 'APPLY' : 'DRY-RUN'} ${product.name}`);
    if (apply) await Product.updateOne({ _id: product._id }, { $set: { aiProfile: next } });
  }
  const missing = Object.keys(PROFILES).filter(name => !found.has(name));
  if (missing.length) console.warn(`未找到产品：${missing.join('、')}`);
  console.log(`${apply ? '已更新' : '将更新'} ${products.length} 个产品；${apply ? '' : '添加 --apply 才会写入数据库。'}`);
  await mongoose.disconnect();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
