import React, {useState} from 'react'
import {staffAPI} from '../api'
export default function DentalGiftCard({gift,planId,canEdit,onChange,toast}) {
  const [institution,setInstitution]=useState(gift.institution || ''),[date,setDate]=useState(gift.appointmentDate || ''),[note,setNote]=useState(''),[busy,setBusy]=useState(false)
  const action=async type=>{
    setBusy(true)
    try {const res=await staffAPI.updateDentalGift(planId,{action:type,revision:gift.revision,institution,appointmentDate:date,completedDate:date,note});onChange(res.data);setNote('');toast('赠送服务记录已更新')}
    catch(e){toast(e.message)}finally{setBusy(false)}
  }
  return <div style={{background:'#edf7f1',borderRadius:10,padding:16,marginBottom:16}}>
    <strong>企业会员赠送 · 单次洁牙1次</strong>
    <p>有效期至 {gift.expiresAt} · {({unknown:'使用情况待核对',available:'已确认未使用，可协助预约',booked:'工作人员已登记预约',used:'已使用并登记核销'})[gift.status]}{gift.expired && gift.status!=='used' ? ' · 已过期' : ''}</p>
    <p>工作人员与客户确定时间后联系机构预约；具体洁牙方式由接诊医生确定。此权益不是365会员年卡，无需购买年卡。</p>
    {gift.institution && <p>预约机构：{gift.institution} · {gift.appointmentDate}</p>}
    {gift.completedDate && <p>完成日期：{gift.completedDate}</p>}
    {canEdit && gift.status!=='used' && <fieldset disabled={busy} style={{border:0,padding:0}}>
      {['available','booked'].includes(gift.status) && !gift.expired && <label>已联系确认的机构<input value={institution} maxLength={200} onChange={e=>setInstitution(e.target.value)} /></label>}
      <label style={{display:'block',marginTop:8}}>{gift.status==='unknown' || gift.expired ? '历史实际完成日期（仅补登记已使用时填写）' : gift.status==='booked' ? '预约日期／实际完成日期' : '与机构确认的预约日期'}<input type="date" value={date} max={gift.expiresAt} onChange={e=>setDate(e.target.value)} /></label>
      <label style={{display:'block',marginTop:8}}>核对或服务记录<textarea value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="填写实际核对结果、预约确认或完成凭据" style={{display:'block',width:'100%'}} /></label>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:10}}>
        {gift.status==='unknown' && <>{!gift.expired && <button type="button" onClick={()=>action('verify')}>已核对，确认未使用</button>}<button type="button" onClick={()=>action('historical')}>补登记此前已使用</button></>}
        {['available','booked'].includes(gift.status) && !gift.expired && <button type="button" onClick={()=>action('book')}>{gift.status==='booked'?'更新预约记录':'登记已确认预约'}</button>}
        {gift.status==='booked' && <button type="button" onClick={()=>action('complete')}>确认已完成，登记核销</button>}
      </div>
    </fieldset>}
  </div>
}
