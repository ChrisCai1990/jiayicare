import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const defaults={title:'健康基金使用规则',description:'',personalPriority:true,personalDeductionType:'unlimited',personalDeductionValue:0,corporateDeductionType:'fixedAmount',corporateDeductionValue:200,minOrderAmount:0,eligibleCategories:[],eligibleProductIds:[],allowCouponStacking:true,couponDeductionType:'unlimited',couponDeductionValue:0,refundToOriginalSource:true,enabled:false,sharerAmount:0,recipientAmount:0,inviteEnabled:false,inviterAmount:0,inviteeAmount:0,firstLoginEnabled:false,firstLoginAmount:0,pointsExchangeEnabled:true,pointsPerYuan:100,healthCheckinPoints:5}
const typeOptions=[['unlimited','不限制（最多抵至应付金额）'],['fixedAmount','固定金额上限'],['percentage','订单金额比例上限']]
function LimitField({title,type,value,onType,onValue}) { return <div className="form-group"><label className="form-label">{title}</label><div style={{display:'grid',gridTemplateColumns:'minmax(240px,1fr) minmax(180px,1fr)',gap:12}}><select className="form-input" value={type} onChange={e=>onType(e.target.value)}>{typeOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{type!=='unlimited'&&<div style={{display:'flex',alignItems:'center',gap:8}}><input className="form-input" type="number" min="0" max={type==='percentage'?100:undefined} value={value} onChange={e=>onValue(e.target.value)}/><span>{type==='percentage'?'%':'元/单'}</span></div>}</div></div> }

const productRuleOptions=[['inherit','继承平台规则'],['unlimited','可全额抵扣'],['fixedAmount','固定金额'],['percentage','按订单比例'],['disabled','不可抵扣']]
function ProductRuleField({rule,onChange}) {
 const mode=rule?.mode||'inherit',value=rule?.value??0
 return <div style={{display:'grid',gridTemplateColumns:'minmax(135px,1fr) minmax(95px,.7fr)',gap:8,marginTop:9}} onClick={e=>e.stopPropagation()}>
  <select className="form-input" style={{padding:'7px 8px'}} value={mode} onChange={e=>onChange({mode:e.target.value,value:0})}>{productRuleOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
  {(mode==='fixedAmount'||mode==='percentage')?<div style={{display:'flex',alignItems:'center',gap:5}}><input className="form-input" style={{padding:'7px 8px',minWidth:0}} type="number" min="0" max={mode==='percentage'?100:undefined} value={value} onChange={e=>onChange({mode,value:e.target.value})}/><span>{mode==='percentage'?'%':'元'}</span></div>:<span/>}
 </div>
}

export default function HealthFundConfigPage(){
 const toast=useToast(),[form,setForm]=useState(defaults),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[referrals,setReferrals]=useState([]),[categories,setCategories]=useState([]),[products,setProducts]=useState([]),[changedProductRules,setChangedProductRules]=useState({})
 useEffect(()=>{Promise.all([adminAPI.getHealthFundConfig(),adminAPI.getHealthFundReferrals(),adminAPI.productCategories(),adminAPI.products({limit:500})]).then(([r,rr,cr,pr])=>{setForm({...defaults,...r.data});setReferrals(rr.data||[]);setCategories((cr.data||[]).filter(c=>c.status!=='disabled'));setProducts((pr.data||[]).filter(p=>p.status!=='disabled'&&p.isActive!==false))}).catch(e=>toast(e.message)).finally(()=>setLoading(false))},[])
 const set=(k,v)=>setForm(f=>({...f,[k]:v}));
 const setProductRule=(id,rule)=>{setProducts(rows=>rows.map(p=>String(p._id)===id?{...p,healthFundDeduction:rule}:p));setChangedProductRules(rows=>({...rows,[id]:rule}))}
 const save=async()=>{setSaving(true);try{const entries=Object.entries(changedProductRules);const [r]=await Promise.all([adminAPI.updateHealthFundConfig(form),...entries.map(([id,rule])=>adminAPI.updateProductHealthFundDeduction(id,{mode:rule.mode,value:Math.max(0,Number(rule.value)||0)}))]);setForm({...defaults,...r.data});setChangedProductRules({});toast(entries.length?`已保存基金配置及 ${entries.length} 个商品抵扣规则`:r.message)}catch(e){toast(e.message)}finally{setSaving(false)}}
 const visibleProducts=(form.eligibleCategories||[]).length?products.filter(p=>(form.eligibleCategories||[]).includes(p.category)):products
 if(loading)return <div className="page-loading">加载中...</div>
 return <div className="page"><div className="page-header"><div><h1 className="page-title">💰 健康基金管理</h1><p className="page-subtitle">设置 C 端实际抵扣规则；企业客户资料及企业专属规则仍在“企业客户管理”中维护。</p></div></div><div className="card"><div className="card-body" style={{maxWidth:860}}>
 <h3>基金抵扣参数</h3>
  <LimitField title="自有健康基金每单最高抵扣" type={form.personalDeductionType} value={form.personalDeductionValue} onType={v=>set('personalDeductionType',v)} onValue={v=>set('personalDeductionValue',v)}/>
  <LimitField title="企业赠送健康基金每单最高抵扣（平台上限）" type={form.corporateDeductionType} value={form.corporateDeductionValue} onType={v=>set('corporateDeductionType',v)} onValue={v=>set('corporateDeductionValue',v)}/>
  <div className="form-group"><label className="form-label">使用健康基金最低订单金额（元）</label><input className="form-input" type="number" min="0" value={form.minOrderAmount} onChange={e=>set('minOrderAmount',e.target.value)}/></div>
  <div className="form-group"><label className="form-label">可抵扣商城分类（用于筛选商品）</label><p style={{color:'#718096',margin:'4px 0 10px'}}>可先选分类缩小范围，再在下方逐个选择实际可抵扣商品。</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10,padding:14,border:'1px solid #e2e8f0',borderRadius:12}}>{categories.map(c=>{const name=c.name;const checked=(form.eligibleCategories||[]).includes(name);return <label key={c._id||name} style={{display:'flex',gap:9,alignItems:'center',padding:'11px 12px',background:checked?'#ecfdf5':'#f8fafc',borderRadius:9,border:checked?'1px solid #22A06B':'1px solid transparent'}}><input type="checkbox" checked={checked} onChange={()=>set('eligibleCategories',checked?(form.eligibleCategories||[]).filter(v=>v!==name):[...(form.eligibleCategories||[]),name])}/><span>{name}</span></label>})}</div></div>
  <div className="form-group"><label className="form-label">具体可抵扣商品（未勾选表示按上方分类全部适用）</label><p style={{color:'#718096',margin:'4px 0 10px'}}>勾选商品后，可直接设置全额抵扣、固定金额或订单金额比例。</p><div style={{maxHeight:520,overflowY:'auto',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(330px,1fr))',gap:10,padding:14,border:'1px solid #e2e8f0',borderRadius:12}}>{visibleProducts.map(p=>{const id=String(p._id);const checked=(form.eligibleProductIds||[]).map(String).includes(id);return <label key={id} style={{display:'block',padding:'11px 12px',background:checked?'#ecfdf5':'#f8fafc',borderRadius:9,border:checked?'1px solid #22A06B':'1px solid transparent'}}><span style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" checked={checked} onChange={()=>set('eligibleProductIds',checked?(form.eligibleProductIds||[]).filter(v=>String(v)!==id):[...(form.eligibleProductIds||[]),id])}/><span><strong>{p.name}</strong><small style={{display:'block',color:'#718096'}}>{p.category||'未分类'} · 商品价 ¥{p.price??p.originalPrice??'-'}</small></span></span>{checked&&<ProductRuleField rule={p.healthFundDeduction} onChange={rule=>setProductRule(id,rule)}/>}</label>})}{visibleProducts.length===0&&<p style={{color:'#718096'}}>当前分类下暂无上架商品。</p>}</div></div>
  <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.personalPriority} onChange={e=>set('personalPriority',e.target.checked)}/>优先抵扣自有基金（不勾选则优先抵扣企业赠送基金）</label>
  <h3 style={{marginTop:28}}>积分与健康基金</h3>
  <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={form.pointsExchangeEnabled!==false} onChange={e=>set('pointsExchangeEnabled',e.target.checked)}/>每满指定积分自动兑换为1元自有健康基金</label>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
    <div className="form-group"><label className="form-label">每1元健康基金所需积分</label><input className="form-input" type="number" min="1" value={form.pointsPerYuan} onChange={e=>set('pointsPerYuan',e.target.value)}/></div>
    <div className="form-group"><label className="form-label">每次有效健康数据打卡奖励</label><input className="form-input" type="number" min="0" value={form.healthCheckinPoints} onChange={e=>set('healthCheckinPoints',e.target.value)}/><small style={{color:'#718096'}}>同类数据每天限奖励一次</small></div>
  </div>
  <p style={{color:'#718096'}}>积分兑换所得计入“自有基金”；现行消费奖励为现金实付每1元获1积分。</p>
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
  <h3>邀请关系记录</h3><p style={{color:'#718096'}}>即使未启用自动奖励，也会保留邀请关系，便于运营审核和赠送健康基金。</p>
  {referrals.length===0?<p style={{color:'#718096'}}>暂无邀请成功记录</p>:<div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>邀请人</th><th>邀请人手机</th><th>受邀人</th><th>受邀人手机</th><th>建立关系</th><th>首次登录</th><th>奖励时间</th></tr></thead><tbody>{referrals.map(row=><tr key={row._id}><td>{row.inviter?.name||'-'}</td><td>{row.inviter?.phone||'-'}</td><td>{row.invitee?.name||'-'}</td><td>{row.invitee?.phone||'-'}</td><td>{row.invitedAt?new Date(row.invitedAt).toLocaleString('zh-CN'):'-'}</td><td>{row.firstLoginAt?new Date(row.firstLoginAt).toLocaleString('zh-CN'):'-'}</td><td>{row.rewardedAt?new Date(row.rewardedAt).toLocaleString('zh-CN'):'未自动奖励'}</td></tr>)}</tbody></table></div>}
 </div></div></div>
}
