import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

export default function HealthFundConfigPage() {
  const toast = useToast()
  const [form, setForm] = useState({ title:'健康基金使用规则', description:'', personalPriority:true, allowCouponStacking:true, refundToOriginalSource:true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { adminAPI.getHealthFundConfig().then(r=>setForm(f=>({...f,...r.data}))).catch(e=>toast(e.message)).finally(()=>setLoading(false)) }, [])
  const set = (key,value) => setForm(f=>({...f,[key]:value}))
  const save = async () => { setSaving(true); try { const r=await adminAPI.updateHealthFundConfig(form); toast(r.message); } catch(e){ toast(e.message) } finally { setSaving(false) } }
  if (loading) return <div className="page-loading">加载中...</div>
  return <div className="page">
    <div className="page-header"><div><h1 className="page-title">💰 健康基金管理</h1><p className="page-subtitle">管理 C 端健康基金的使用原则、叠加规则和退款说明；不影响 B2B2C 企业客户资料。</p></div></div>
    <div className="card"><div className="card-body" style={{maxWidth:760}}>
      <div className="form-group"><label className="form-label">规则标题</label><input className="form-input" value={form.title||''} onChange={e=>set('title',e.target.value)}/></div>
      <div className="form-group"><label className="form-label">用户端展示的完整规则</label><textarea className="form-input" rows={6} value={form.description||''} onChange={e=>set('description',e.target.value)} placeholder="说明适用服务、抵扣顺序、抵扣上限、有效期及退款返还原则"/></div>
      <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.personalPriority} onChange={e=>set('personalPriority',e.target.checked)}/>自有基金优先抵扣</label>
      <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.allowCouponStacking} onChange={e=>set('allowCouponStacking',e.target.checked)}/>允许与抵用券叠加</label>
      <label style={{display:'flex',gap:8,margin:'14px 0'}}><input type="checkbox" checked={!!form.refundToOriginalSource} onChange={e=>set('refundToOriginalSource',e.target.checked)}/>退款审核通过后按原来源退回</label>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'保存中...':'保存规则'}</button>
    </div></div>
  </div>
}
