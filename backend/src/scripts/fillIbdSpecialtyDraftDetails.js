require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const SpecialtyLibrary = require('../models/SpecialtyLibrary');
const template = require('../data/ibdStandardTemplate.json');

const sharedFields = ['overview', 'serviceBoundary', 'roles', 'diaryGuide', 'exceptionGuide', 'visitGuide', 'recordGuide', 'educationGuide', 'sourceNote'];
const stageFields = ['purpose', 'owner', 'trigger', 'actions', 'deliverables', 'handoff', 'exceptionHandling'];
const blank = value => typeof value !== 'string' || !value.trim();

function filledDraft(draft) {
  const next = {};
  for (const field of sharedFields) if (blank(draft[field])) next[field] = template[field];
  if (!draft.diseases?.length) next.diseases = template.diseases;
  const stages = (draft.stages || []).map(stage => {
    const source = template.stages.find(item => item.title === stage.title);
    const result = { ...stage };
    for (const field of stageFields) {
      if (!blank(result[field])) continue;
      if (source?.[field]) result[field] = source[field];
      else if (field === 'actions') result[field] = `核对“${stage.title}”的启动依据和客户当前情况，按健康顾问确认的要求执行本阶段事项，记录实际完成时间与过程。`;
      else if (field === 'deliverables') result[field] = `保存“${stage.title}”的执行记录、客户反馈及相关资料，标明完成状态、责任人与时间。`;
      else if (field === 'exceptionHandling') result[field] = '发生客户改期、资料缺失或其他延误时记录原因与下一次核实时间；需要医学判断时反馈健康顾问，由其联系专科医师。';
      else if (field === 'trigger') result[field] = '由上一阶段完成或健康顾问确认后启动。';
      else if (field === 'owner') result[field] = '健康顾问';
      else if (field === 'purpose') result[field] = `完成“${stage.title}”对应的服务目标。`;
      else if (field === 'handoff') result[field] = '记录完成凭据，并将需继续处理的事项交接给下一责任岗位。';
    }
    return result;
  });
  if (!stages.length) next.stages = template.stages;
  else if (JSON.stringify(stages) !== JSON.stringify(draft.stages)) next.stages = stages;
  if (!draft.variantGuides?.length) next.variantGuides = template.variantGuides;
  else {
    const variants = draft.variantGuides.map(variant => {
      const source = template.variantGuides.find(item => item.name === variant.name);
      const result = { ...variant };
      for (const field of ['monitoringFocus', 'diaryFocus', 'specialistQuestions', 'exceptionNotes']) {
        if (!blank(result[field])) continue;
        result[field] = source?.[field] || '记录客户当前情况与专科意见；需要医学判断或方案变化时由健康顾问联系专科医师确认。';
      }
      return result;
    });
    if (JSON.stringify(variants) !== JSON.stringify(draft.variantGuides)) next.variantGuides = variants;
  }
  return next;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 未配置');
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(process.env.MONGODB_URI);
  const drafts = await SpecialtyLibrary.find({ status: 'draft', title: /IBD|炎症性肠病/i }).lean();
  let changed = 0;
  for (const draft of drafts) {
    const update = filledDraft(draft);
    if (!Object.keys(update).length) continue;
    console.log(`草稿 ${draft._id}：待补 ${Object.keys(update).join('、')}`);
    if (process.argv.includes('--apply')) {
      const result = await SpecialtyLibrary.updateOne({ _id: draft._id, status: 'draft', updatedAt: draft.updatedAt }, { $set: update });
      if (!result.modifiedCount) throw new Error(`草稿 ${draft._id} 已被其他人修改，请重新运行`);
      changed++;
    }
  }
  console.log(`匹配 IBD 草稿 ${drafts.length} 条；${process.argv.includes('--apply') ? '已补齐' : '待补齐'} ${process.argv.includes('--apply') ? changed : drafts.filter(draft => Object.keys(filledDraft(draft)).length).length} 条。`);
  await mongoose.disconnect();
}
main().catch(error => { console.error(error); process.exit(1); });
