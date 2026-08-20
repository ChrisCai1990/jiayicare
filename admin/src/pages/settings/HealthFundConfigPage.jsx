import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const defaults={title:'健康基金使用规则',description:'',personalPriority:true,personalDeductionType:'unlimited',personalDeductionValue:0,corporateDeductionType:'fixedAmount',corporateDeductionValue:200,minOrderAmount:0,eligibleCategories:[],allowCouponStacking:true,couponDeductionType:'unlimited',couponDeductionValue:0,refundToOriginalSource:true,enabled:false,sharerAmount:0,recipientAmount:0,inviteEnabled:false,inviterAmount:0,inviteeAmount:0,firstLoginEnabled:false,firstLoginAmount:0}
const typeOptions=[['unlimited','不限制（最多抵至应付金额）'],['fixedAmount','固定金额上限'],['percentage','订单金额比例上限']]
function LimitField({title,type,value,onType,onValue}) { return <div className="form-group"><label className="form-label">{title}</label><div style={{display:'grid',gridTemplateColumns:'minmax(240px,1fr) minmax(180px,1fr)',gap:12}}><select className="form-input" value={type} onChange={e=>onType(e.target.value)}>{typeOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{type!=='unlimited'&&<div style={{display:'flex',alignItems:'center',gap:8}}><input className="form-input" type="number" min="0" max={type==='percentage'?100:undefined} value={value} onChange={e=>onValue(e.target.value)}/><span>{type==='percentage'?'%':'元/单'}</span></div>}</div></div> }

export default function HealthFundConfigPage(){
 const toast=useToast(),[form,setForm]=useState(defaults),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[referrals,setReferrals]=useState([])
 useEffect(()=>{Promise.all([adminAPI.getHealthFundConfig(),adminAPI.getHealthFundReferrals()]).then(([r,rr])=>{setForm({...defaults,...r.data});setReferrals(rr.data||[])}).catch(e=>toast(e.message)).finally(()=>setLoading(false))},[])
 const set=(k,v)=>setForm(f=>({...f,[k]:v})); const save=async()=>{setSaving(true);try{const r=await adminAPI.updateHealthFundConfig(form);setForm({...defaults,...r.data});toast(r.message)}catch(e){toast(e.message)}finally{setSaving(false)}}
 if(loading)return <div className="page-loading">加载中...</div>
 return <div className="page"><div className="page-header"><div><h1 className="page-title">💰 健康基金管理</h1><p className="page-subtitle">设置 C 端实际抵扣规则；企业客户资料及企业专属规则仍在“企业客户管理”中维护。</p></div></div><div className="card"><div className="card-body" style={{maxWidth:860}}>
  <h3>基金抵扣参数</h3>
  <LimitField title="自有健康基金每单最高抵扣" type={form.personalDeductionType} value={form.personalDeductionValue} onType={v=>set('personalDeductionType',v)} onValue={v=>set('personalDeductionValue',v)}/>
  <LimitField title="企业赠送健康基金每单最高抵扣（平台上限）" type={form.corporateDeductionType} value={form.corporateDeductionValue} onType={v=>set('corporateDeductionType',v)} onValue={v=>set('corporateDeductionValue',v)}/>
  <div className="form-group"><label className="form-label">使用健康基金最低订单金额（元）</label><input className="form-input" type="number" min="0" value={form.minOrderAmount} onChange={e=>set('minOrderAmount',e.target.value)}/></div>
  <div className="form-group"><label className="form-label">可用服务分类（逗号分隔；留空表示全部）</label><input className="form-input" value={(form.eligibleCategories||[]).join(',')} onChange={e=>set('eligibleCategories',e.target.value.split(',').map(v=>v.trim()).filter(Boolean))}/></div>
  <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.personalPriority} onChange={e=>set('personalPriority',e.target.checked)}/>优先抵扣自有基金（不勾选则优先抵扣企业赠送基金）</label>
  <h3 style={{marginTop:28}}>抵用券规则</h3>
  <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.allowCouponStacking} onChange={e=>set('allowCouponStacking',e.target.checked)}/>允许健康基金与抵用券同单叠加（当前顺序：先抵用券，后健康基金）</label>
  <LimitField title="抵用券每单最高抵扣（平台上限）" type={form.couponDeductionType} value={form.couponDeductionValue} onType={v=>set('couponDeductionType',v)} onValue={v=>set('couponDeductionValue',v)}/>
  <h3 style={{marginTop:28}}>用户说明与退款</h3>
  <div className="form-group"><label className="form-label">规则标题</label><input className="form-input" value={form.title||''} onChange={e=>set('title',e.target.value)}/></div>
  <div className="form-group"><label className="form-label">补充说明（仅展示，不参与计算）</label><textarea className="form-input" rows={4} value={form.description||''} onChange={e=>set('description',e.target.value)}/></div>
  <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.refundToOriginalSource} onChange={e=>set('refundToOriginalSource',e.target.checked)}/>退款审核通过后，基金按自有/企业原来源退回</label>
  <h3 style={{marginTop:28}}>产品分享成交奖励</h3>
  <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.enabled} onChange={e=>set('enabled',e.target.checked)}/>启用客户分享产品成交后双方健康基金奖励</label>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
    <div className="form-group"><label className="form-label">分享客户奖励（元）</label><input className="form-input" type="number" min="0" value={form.sharerAmount} onChange={e=>set('sharerAmount',e.target.value)}/></div>
    <div className="form-group"><label className="form-label">购买客户奖励（元）</label><input className="form-input" type="number" min="0" value={form.recipientAmount} onChange={e=>set('recipientAmount',e.target.value)}/></div>
  </div>
  <p style={{color:'#718096'}}>奖励仅在被分享客户完成有效支付后发放；全额退款时自动冲销，分享人不能给自己产生奖励。</p>
  <h3 style={{marginTop:28}}>邀请好友首次使用奖励</h3>
  <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.inviteEnabled} onChange={e=>set('inviteEnabled',e.target.checked)}/>启用 A 邀请 B 首次登录后双方健康基金奖励</label>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
    <div className="form-group"><label className="form-label">邀请人奖励（元）</label><input className="form-input" type="number" min="0" value={form.inviterAmount} onChange={e=>set('inviterAmount',e.target.value)}/></div>
    <div className="form-group"><label className="form-label">受邀人奖励（元）</label><input className="form-input" type="number" min="0" value={form.inviteeAmount} onChange={e=>set('inviteeAmount',e.target.value)}/></div>
  </div>
  <p style={{color:'#718096'}}>同一受邀客户仅奖励一次；自己不能邀请自己。奖励在受邀客户首次完成手机号登录后入账。</p>
  <h3 style={{marginTop:28}}>首次使用奖励</h3>
  <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.firstLoginEnabled} onChange={e=>set('firstLoginEnabled',e.target.checked)}/>启用客户首次登录小程序健康基金奖励（含已有客户首次使用）</label>
  <div className="form-group"><label className="form-label">首次登录赠送金额（元）</label><input className="form-input" type="number" min="0" value={form.firstLoginAmount} onChange={e=>set('firstLoginAmount',e.target.value)}/></div>
  <p style={{color:'#718096'}}>企业赠送基金的实际可抵扣额，会取本页平台上限与“企业客户管理”中该企业专属上限的较小值。</p>
  <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'保存中...':'保存并立即生效'}</button>
 </div></div>
 <div className="card" style={{marginTop:20}}><div className="card-body">
  <h3>邀请关系记录</h3>
  {referrals.length===0?<p style={{color:'#718096'}}>暂无邀请成功记录</p>:<div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>邀请人</th><th>邀请人手机</th><th>受邀人</th><th>受邀人手机</th><th>首次登录</th><th>奖励时间</th></tr></thead><tbody>{referrals.map(row=><tr key={row._id}><td>{row.inviter?.name||'-'}</td><td>{row.inviter?.phone||'-'}</td><td>{row.invitee?.name||'-'}</td><td>{row.invitee?.phone||'-'}</td><td>{row.firstLoginAt?new Date(row.firstLoginAt).toLocaleString('zh-CN'):'-'}</td><td>{row.rewardedAt?new Date(row.rewardedAt).toLocaleString('zh-CN'):'-'}</td></tr>)}</tbody></table></div>}
 </div></div></div>
}
