import React,{useState,useRef,useEffect} from 'react'
import {careFlowAPI} from '../api'

export default function CareFlowReportUploads({flowId,onUploaded,onBusyChange,onPendingChange}){
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const lock=useRef(false)
  useEffect(()=>{onPendingChange?.(rows.some(r=>!r.saved))},[rows,onPendingChange])
  const update=(id,patch)=>setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r))
  async function upload(){
    if(lock.current)return
    lock.current=true;setBusy(true);onBusyChange?.(true);setError('')
    try{
      for(const r of rows.filter(r=>!r.saved)){
        const body=new FormData();body.append('file',r.file);body.append('title',r.title);body.append('category',r.category)
        const result=await careFlowAPI.upload(flowId,body)
        update(r.id,{saved:true});onUploaded(result)
      }
    }catch(e){setError(e.message+'；已成功的文件保留，重试仅处理未完成项。')}
    finally{lock.current=false;setBusy(false);onBusyChange?.(false)}
  }
  return <section style={{display:'grid',gap:12}}><h4>上传本次资料（可多选、逐份分类）</h4>
    <input aria-label="选择多份资料" disabled={busy} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>{const files=Array.from(e.target.files||[]);setRows(old=>[...old,...files.map((file,i)=>({id:`${Date.now()}-${i}-${Math.random()}`,file,title:file.name,category:'exam_report'}))]);e.target.value=''}}/>
    {rows.map(r=><div key={r.id} style={{display:'grid',gap:8,padding:12,border:'1px solid #E0D9CE',borderRadius:12}}><input aria-label="资料名称" className="form-input" disabled={busy||r.saved} value={r.title} onChange={e=>update(r.id,{title:e.target.value})}/><select aria-label="资料类型" className="form-input" disabled={busy||r.saved} value={r.category} onChange={e=>update(r.id,{category:e.target.value})}><option value="outpatient_record">门诊病历</option><option value="prescription_order">处方/医嘱单</option><option value="exam_report">检查报告</option></select>{r.saved?<span>已上传，原件已留存</span>:<button disabled={busy} onClick={()=>setRows(old=>old.filter(v=>v.id!==r.id))}>移除未上传项</button>}</div>)}
    <button disabled={busy||!rows.some(r=>!r.saved)||rows.some(r=>!r.title.trim())} onClick={upload}>{busy?'正在上传…':'上传所选资料并留存原件'}</button>{error&&<p role="alert" style={{color:'#B91C1C'}}>{error}</p>}
  </section>
}
