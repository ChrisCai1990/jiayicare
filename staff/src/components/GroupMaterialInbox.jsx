import React,{useEffect,useRef,useState} from 'react';
import {serviceGroupAPI as api} from '../api';

export default function GroupMaterialInbox({group,caps,busy,run,can}) {
  const [rows,setRows]=useState([]),[selected,setSelected]=useState([]),[error,setError]=useState('');
  const [patientId,setPatient]=useState(''),[purpose,setPurpose]=useState(''),[title,setTitle]=useState(''),[date,setDate]=useState('');
  const [category,setCategory]=useState('outpatient_record'),[result,setResult]=useState([]),[showDone,setShowDone]=useState(false);
  const active=useRef(true);
  const load=async()=>{
    try {const r=await api.get(`/${group._id}/inbox`);if(active.current){setRows(r.data);setError('');}}
    catch(e){if(active.current){setRows([]);setError(e.message);}}
  };
  useEffect(()=>{
    active.current=true;let running=false;
    const poll=async()=>{if(running||document.visibilityState!=='visible'||!group.archiveConsent)return;running=true;try{await load();}finally{running=false;}};
    poll();const timer=setInterval(poll,15000);document.addEventListener('visibilitychange',poll);
    return()=>{active.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
  },[group._id,group.archiveConsent]);
  const choose=(id)=>setSelected(old=>old.includes(id)?old.filter(x=>x!==id):old.length<9?[...old,id]:old);
  const allowed=can(purpose==='report'?'reports':'service_records','create');
  return <section className="sa-materials">
    <div className="sa-row"><h2>群资料待归档</h2><button disabled={busy||!group.archiveConsent} onClick={load}>刷新资料</button></div>
    <small>{!caps?.archiveConfigured?'等待会话存档审核及采集接入；目前不会自动收到真实群图片。':!group.archiveConsent?'当前群尚未确认存档授权，请由负责人核对群设置。':'每15秒检查已接入资料；只收件，不自动入库。'}</small>
    <small>最近100条消息内的附件，暂存30天。打卡原图存服务记录；就诊资料存报告待解析。多选逐份归档，不拼接图片。</small>
    {error&&<p role="alert">{error}</p>}
    <label className="sa-check"><input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)}/>显示已归档资料</label>
    {!rows.some(m=>showDone||m.state!=='archived')&&<div className="sa-empty">暂无待归档资料</div>}
    <div className="sa-material-grid">{rows.filter(m=>showDone||m.state!=='archived').map(m=><article className="sa-card" key={m._id}>
      {m.mimeType?.startsWith('image/')?<a href={m.previewUrl} target="_blank" rel="noreferrer"><img src={m.previewUrl} alt={m.name} loading="lazy"/></a>:<a href={m.previewUrl} target="_blank" rel="noreferrer">预览 PDF</a>}
      <small>{new Date(m.sentAt).toLocaleString('zh-CN')} · {m.sender}</small>
      <p>{m.name}</p>
      <small>{({pending:'待确认',processing:'正在归档，请勿重复提交',failed:'上次未完成，可按原确认信息重试',archived:'已归档'})[m.state]}</small>
      {m.patientId&&<small>已确认：{group.members.find(x=>(x.patientId?._id||x.patientId)===m.patientId)?.patientId?.name||'家庭成员'} · {m.title} · {m.date}</small>}
      {m.state==='failed'&&<button disabled={busy} onClick={()=>{setPatient(m.patientId);setPurpose(m.purpose);setTitle(m.title);setDate(m.date);setCategory(m.documentCategory);setSelected([m._id]);}}>载入上次确认信息</button>}
      {['pending','failed'].includes(m.state)&&<label className="sa-check"><input type="checkbox" aria-label={'选择资料 '+m.name} disabled={busy||(!selected.includes(m._id)&&selected.length>=9)} checked={selected.includes(m._id)} onChange={()=>choose(m._id)}/>选择归档</label>}
    </article>)}</div>
    {!!selected.length&&<form className="sa-card sa-form" onSubmit={e=>{e.preventDefault();run(async()=>{
      const r=await api.post(`/${group._id}/inbox/confirm`,{messageIds:selected,patientId,purpose,title,date,documentCategory:category});
      if(!active.current)return;setResult(r.data);setSelected(r.data.filter(x=>!x.success).map(x=>x.messageId));await load();
    });}}>
      <h3>确认归档 {selected.length} 份原件</h3><small>发送人不一定是资料本人。请确认所选原件属于同一个人、同一天；不同人员请分批处理。</small>
      <label>资料所属成员<select required value={patientId} disabled={busy} onChange={e=>setPatient(e.target.value)}><option value="">请选择本人或家属</option>{group.members.map(m=><option key={m.patientId._id||m.patientId} value={m.patientId._id||m.patientId}>{m.patientId.name} · {m.relation||'成员'}</option>)}</select></label>
      <label>归档用途<select required value={purpose} disabled={busy} onChange={e=>setPurpose(e.target.value)}><option value="">请选择用途</option><option value="checkin">打卡原图（不提取健康数值）</option><option value="report">就诊／检查资料（待解析）</option></select></label>
      <label>本批资料名称<input required maxLength={160} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
      <label>资料日期<input type="date" required value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
      {purpose==='report'&&<label>就诊资料类别<select value={category} disabled={busy} onChange={e=>setCategory(e.target.value)}>{Object.entries({outpatient_record:'门诊病历',inpatient_record:'住院病历',lab_report:'检验报告',exam_report:'检查报告',prescription_order:'处方',physical_exam:'体检报告',other_customer_material:'其他资料'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}
      <button className="sa-primary" disabled={busy||!allowed||!patientId||!purpose}>确认归档所选资料</button>
      <button type="button" disabled={busy} onClick={()=>setSelected([])}>取消选择</button>
      {!allowed&&<small>当前账号没有此类资料的归档权限。</small>}
    </form>}
    {!!result.length&&<div className="sa-notice" role="status"><span>{result.filter(x=>x.success).length}份完成（其中{result.filter(x=>x.duplicate).length}份为已有原件），{result.filter(x=>!x.success).length}份未完成。{result.filter(x=>!x.success).map(x=><small key={x.messageId}>{x.message}</small>)}</span></div>}
  </section>;
}
