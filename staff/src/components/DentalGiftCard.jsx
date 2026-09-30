import React, {useState} from 'react'
import {staffAPI} from '../api'
export default function DentalGiftCard({gift,planId,canEdit,onChange,toast}) {
  const [institution,setInstitution]=useState(gift.institution || ''),[date,setDate]=useState(gift.appointmentDate || ''),[note,setNote]=useState(''),[busy,setBusy]=useState(false)
  const action=async type=>{
    setBusy(true)
    try {const res=await staffAPI.updateDentalGift(planId,{action:type,revision:gift.revision,institution,appointmentDate:date,completedDate:date,note});onChange(res.data);setNote('');toast('赠送服务记录已更新')}
    catch(e){toast(e.message)}finally{setBusy(false)}
  }
  const statusText=({unknown:'待核对',available:'待预约',booked:'已预约',used:'已核销'})[gift.status]
  return <section className="dental-benefit">
    <header className="dental-benefit__header">
      <div><span className="dental-benefit__eyebrow">企业会员权益</span><h3>单次洁牙 <span>1 次赠送</span></h3></div>
      <span className={`dental-benefit__status ${gift.status==='unknown'?'is-pending':''}`}>{gift.expired && gift.status!=='used'?'已过期':statusText}</span>
    </header>
    <div className="dental-benefit__meta">有效期至 <strong>{gift.expiresAt}</strong><span>由工作人员协助预约</span></div>
    <p className="dental-benefit__hint">与客户确认时间后联系机构；具体洁牙方式由接诊医生确定。</p>
    <details className="dental-benefit__explanation"><summary>权益说明</summary><p>此为单次赠送洁牙，无需购买365会员年卡。先核对使用情况，再登记预约或实际完成记录。</p></details>
    {gift.institution && <div className="dental-benefit__booking"><span>预约机构</span><strong>{gift.institution}</strong><span>{gift.appointmentDate}</span></div>}
    {gift.completedDate && <div className="dental-benefit__booking"><span>完成日期</span><strong>{gift.completedDate}</strong></div>}
    {canEdit && gift.status!=='used' && <fieldset disabled={busy} className="dental-benefit__form">
      {['available','booked'].includes(gift.status) && !gift.expired && <label>已确认的服务机构<input value={institution} maxLength={200} placeholder="填写已联系确认的机构名称" onChange={e=>setInstitution(e.target.value)} /></label>}
      {gift.status!=='unknown' && <label>{gift.expired?'实际完成日期':gift.status==='booked'?'预约日期／实际完成日期':'预约日期'}<input type="date" value={date} max={gift.expiresAt} onChange={e=>setDate(e.target.value)} /></label>}
      <label className="dental-benefit__wide">核对或服务记录<textarea value={note} maxLength={500} rows={3} onChange={e=>setNote(e.target.value)} placeholder="填写核对结果、预约确认或完成凭据" /></label>
      <div className="dental-benefit__actions dental-benefit__wide">
        {gift.status==='unknown' && !gift.expired && <button className="service-button service-button--primary" type="button" onClick={()=>action('verify')}>{busy?'保存中…':'确认未使用'}</button>}
        {['available','booked'].includes(gift.status) && !gift.expired && <button className="service-button service-button--primary" type="button" onClick={()=>action('book')}>{gift.status==='booked'?'更新预约':'登记预约'}</button>}
        {gift.status==='booked' && <button className="service-button" type="button" onClick={()=>action('complete')}>确认完成并核销</button>}
      </div>
      {gift.status==='unknown' && <details className="dental-benefit__history dental-benefit__wide"><summary>此前已使用？补登记历史记录</summary><div><label>实际完成日期<input type="date" value={date} max={gift.expiresAt} onChange={e=>setDate(e.target.value)} /></label><button className="service-button" type="button" onClick={()=>action('historical')}>保存历史使用记录</button></div></details>}
    </fieldset>}
  </section>
}
