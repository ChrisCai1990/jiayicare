const {LABELS}=require('./rehabService');
const QUESTIONNAIRE_KEY='rehab_screening_v1';
const questions=[
  ['goal','text','您希望通过运动评估或训练改善什么？'],
  ['exercise','text','最近一个月参加了哪些运动？每周几次、每次多长时间？'],
  ['symptoms','text','目前是否有疼痛、不适、肿胀、麻木或活动受限？请填写部位、出现时间和诱因；没有请填无。'],
  ['injury','text','既往是否有运动损伤、骨折、手术或康复经历？请说明时间及恢复情况；没有请填无。'],
  ['medical','text','目前有哪些已确诊疾病或正在接受的治疗？没有请填无。'],
  ['restrictions','text','医生是否限制过您的运动，或对运动给过特别建议？请说明；没有请填无。'],
  ['warning','multi','近期是否出现以下情况？',['胸部疼痛或压迫感','晕厥或运动时头晕','与运动量不相称的呼吸困难','近期外伤或明显肿胀','新出现或加重的麻木无力','以上均无']],
  ['medications','text','正在使用哪些药物？没有请填无；不确定可写待核实。'],
  ['pregnancy','radio','是否处于妊娠或产后恢复期？',['否','是，请预约前告知工作人员','不适用']],
  ['preference','radio','您倾向的服务方式？',['线上','线下','两者均可']],
  ['schedule','text','方便服务的时间、所在城市以及可使用的运动场地或器材'],
  ['confirmation','radio','我确认按本人目前情况填写，并会在评估或训练前告知新的不适和健康变化。',['确认']],
].map(([id,type,text,options])=>({id,type,text,required:true,options:(options||[]).map(label=>({label,exclusive:label==='以上均无'})),scoreEnabled:false}));
const templates=[
  {name:'运动能力首次评估与复评报告',content:{purpose:'assessment_report',reportLabels:LABELS,reportFooter:'本报告记录本次运动能力评估或指导情况。请按复健师建议逐步运动，新的或加重的不适应及时反馈并按建议接受医疗评估。'}},
  {name:'运动入门与能力提升方案',content:{purpose:'training_plan',goal:'',exercises:'',weeklyFreq:'',duration:'',precautions:'',progression:''}},
  {name:'运动功能改善与复健训练方案',content:{purpose:'training_plan',goal:'',exercises:'',weeklyFreq:'',duration:'',precautions:'',progression:''}},
];
function products(questionnaireId,validityDays=365) {
  const common={category:'运动评估与复健',status:'on',stockLimited:false,stock:0,bookingRequired:true,deliveryRequired:false,fulfillmentType:'offline_service',serviceProvider:'jiayihui_health',paymentChannel:'wechat_pay',validityDays,healthFundDeduction:{mode:'disabled',value:0},serviceLocation:'线上或线下，具体时间、时长及地点由健管专员预约确认',serviceWorkflow:{key:'rehab',questionnaireId,closureMode:'planner_review',notes:'健康规划师接单 → 健管专员预约安排 → 运动复健师评估、制定方案与执行。运动方案由复健师直接发布。'}};
  return [
    {...common,name:'首次运动能力评估',subtitle:'了解当前运动能力，明确适合的运动起点',originalPrice:1000,sortOrder:25,features:['预约前筛查','运动复健师评估','个性化运动建议与报告','线上或线下'],description:'首次运动能力评估1000元。包括预约前筛查、目标访谈、适合当前情况的运动能力评估、结果解释及书面运动建议。线上评估以可完成项目为准，无法完成的项目会记录并建议线下补充。首次评估独立购买，不占后续训练套餐次数。',skus:[{code:'rehab_initial',label:'首次评估 · 线上或线下',price:1000,totalUnits:1,validityDays,active:true}]},
    {...common,name:'运动指导与复健训练',subtitle:'按评估结果开展个性化训练与阶段复评',originalPrice:4800,sortOrder:26,features:['4次4800元 · 90天有效','10次9800元 · 180天有效','线上或线下预约','逐次服务记录'],description:'根据运动评估结果及个人目标安排运动指导或功能训练。4次套餐4800元，支付后90天有效；10次套餐9800元，支付后180天有效。正式预约的线上指导或线下训练每次核销1次；日常简短答疑不自动扣次。首次评估单独购买。每次训练留存服务方式、内容、反馈及下一步安排。',skus:[{code:'rehab_4',label:'4次 · 90天 · 线上或线下',price:4800,totalUnits:4,validityDays:90,active:true},{code:'rehab_10',label:'10次 · 180天 · 线上或线下',price:9800,totalUnits:10,validityDays:180,active:true}]},
  ].map(p=>({...p,servicePrices:p.skus.map(s=>({label:s.label,price:s.price}))}));
}
module.exports={QUESTIONNAIRE_KEY,questions,templates,products};
