const {createHash}=require('crypto');
const {fail,text}=require('./careFlowState');
const categories=['outpatient_record','prescription_order','exam_report'];
function runtime(deps={}) {
  const Flow=deps.Flow||require('../models/CareFlow'),Report=deps.Report||require('../models/MedicalReport');
  const enabled=deps.enabled||require('./healthManagementRollout').enabledForPatient;
  async function load(id,user) {
    if(!/^[a-f0-9]{24}$/i.test(String(id)))fail('任务标识无效',400);
    if(!enabled(user._id))fail('任务不存在',404);
    const f=await Flow.findOne({_id:id,patientId:user._id,tenantId:user.tenantId||null}).lean();
    if(!f)fail('任务不存在',404);
    return f;
  }
  function writable(f) {
    if(f.state.data.upload?.noDocuments)fail('专员已核实本次无资料，追加资料请联系专员');
    if(f.state.customerUpload?.completedAt)fail('本次资料已提交，追加资料请使用常规上传入口');
    if(!['upload','audit'].includes(f.state.stage))fail('当前不在资料收集环节，请联系健管专员');
  }
  async function view(id,user) {
    const f=await load(id,user);
    const reports=await Report.find({_id:{$in:f.state.data.upload?.reportIds||[]},user:user._id,tenantId:user.tenantId||null}).select('_id title documentCategory audit_status').lean();
    const projection=require('./careFlowClientPlans');
    return {id:String(f._id),...projection.uploadContext(f),noDocumentsVerified:!!f.state.data.upload?.noDocuments,completed:!!f.state.customerUpload?.completedAt,canUpload:!f.state.data.upload?.noDocuments&&!f.state.customerUpload?.completedAt&&['upload','audit'].includes(f.state.stage),declaration:f.state.customerUpload?.declaration||null,plans:projection.project(f),reports};
  }
  async function save(f,user,fields,event) {
    const r=await Flow.updateOne({_id:f._id,patientId:user._id,tenantId:user.tenantId||null,revision:f.revision},{$set:fields,$inc:{revision:1},$push:{events:{...event,at:new Date(),by:String(user._id),role:'customer',stage:f.state.stage}}});
    if(!r.modifiedCount)fail('服务信息刚刚更新，请刷新重试；已上传原件不会丢失');
  }
  async function add(id,user,body) {
    const f=await load(id,user);writable(f);
    const title=text(body.title,200),category=body.category;
    if(!categories.includes(category))fail('请选择资料类型',400);
    let claim;
    try {claim=(deps.verify||((token)=>require('jsonwebtoken').verify(token,process.env.JWT_SECRET)))(String(body.uploadToken||''));}catch{fail('上传凭证已失效，请重新选择该文件上传',400);}
    if(claim.scope!=='report-upload'||claim.userId!==String(user._id)||!claim.key||!claim.url)fail('上传凭证无效',400);
    const reportId=createHash('sha256').update(`${id}:${claim.key}`).digest('hex').slice(0,24);
    const ids=[...new Set([...(f.state.data.upload?.reportIds||[]).map(String),reportId])];
    if(ids.length>50)fail('单次服务最多50份资料',400);
    await Report.findOneAndUpdate({_id:reportId,user:user._id,tenantId:user.tenantId||null},{$setOnInsert:{title,type:'other',documentCategory:category,fileUrl:claim.url,ossKey:claim.key,mimeType:claim.mimeType,sourceType:'customer_upload',uploadedByRole:'customer',audit_status:'unaudited',aiStatus:'none',note:`本次就医协助资料 ${id}`}}, {upsert:true,new:true});
    if(!(f.state.data.upload?.reportIds||[]).map(String).includes(reportId))await save(f,user,{'state.data.upload.reportIds':ids},{action:'customer_report_uploaded',reportId,title,category});
    return {reportId,...await view(id,user)};
  }
  async function declare(id,user,body={}) {
    const f=await load(id,user);writable(f);
    const reasons={pending:'暂未拿到资料',no_exam:'已就医，未做检查且没有可提供的资料',no_print:'未打印或未取得病历',other:'其他情况'};
    if(!reasons[body.kind])fail('请选择资料情况',400);
    const note=String(body.note||'').trim();
    if(note.length>500||body.kind==='other'&&!note)fail('请填写500字以内的具体情况',400);
    const previous=f.state.customerUpload?.declaration;
    if(previous?.kind===body.kind&&previous.note===note)return view(id,user);
    const declaration={kind:body.kind,label:reasons[body.kind],note,submittedAt:new Date(),status:'pending_review'};
    await save(f,user,{'state.customerUpload.declaration':declaration},{action:'customer_documents_declared',declaration});
    return view(id,user);
  }
  async function complete(id,user,body) {
    const f=await load(id,user);
    if(body.confirmed!==true)fail('请确认本次资料已上传完毕',400);
    if(f.state.customerUpload?.completedAt)return view(id,user);
    writable(f);
    const ids=f.state.data.upload?.reportIds||[];
    if(!ids.length)fail('请先上传本次资料',400);
    const count=await Report.countDocuments({_id:{$in:ids},user:user._id,tenantId:user.tenantId||null});
    if(count!==ids.length)fail('部分资料已变更，请联系健管专员核对');
    // Only close the customer's reminder. Never advance the service or mark reports audited.
    await save(f,user,{'state.customerUpload':{completedAt:new Date(),reportIds:ids}},{action:'customer_upload_completed',reportIds:ids});
    return view(id,user);
  }
  return {view,add,complete,declare};
}
module.exports={runtime};
