import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const MODE_OPTIONS = {
  medication: [
    ['customer_self', '客户自行购买'], ['online_assisted', '线上协助购买与配送'], ['hospital_assisted', '医院预约配药'],
  ],
  supplement: [
    ['customer_self', '客户自行购买'], ['online_assisted', '线上协助购买与配送'], ['internal_product', '自研营养代餐内部履约'],
  ],
}

export default function SupplyWorkflowConfigPage() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { adminAPI.getSupplyWorkflowConfig().then(r => setData(r.data)).catch(e => toast(e.message)) }, [])
  const setType = (type, key, value) => setData(prev => ({ ...prev, [type]: { ...prev[type], [key]: value } }))
  const toggleMode = (type, mode) => {
    const current = data[type].allowedModes || []
    setType(type, 'allowedModes', current.includes(mode) ? current.filter(v => v !== mode) : [...current, mode])
  }
  const save = async () => {
    setSaving(true)
    try { const r = await adminAPI.updateSupplyWorkflowConfig(data); setData(r.data); toast(r.message) }
    catch (e) { toast(e.message) } finally { setSaving(false) }
  }
  if (!data) return <div className="page-loading">加载中...</div>
  const card = { background: '#fff', border: '1px solid #E3EAE6', borderRadius: 16, padding: 22, boxShadow: '0 5px 18px rgba(26,43,36,.05)' }
  const typeCard = (type, title, reviewer) => <div style={card}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
      <div><h3 style={{ margin: 0 }}>{title}</h3><div style={{ color: '#6B7D74', fontSize: 13, marginTop: 6 }}>风险审核岗位：{reviewer}（安全门禁，不能关闭）</div></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={data[type].enabled} onChange={e => setType(type, 'enabled', e.target.checked)} />启用流程</label>
    </div>
    <label style={{ display: 'block', marginTop: 20, fontSize: 13, fontWeight: 700 }}>提前启动天数</label>
    <input type="number" min="3" max="30" value={data[type].leadDays} onChange={e => setType(type, 'leadDays', e.target.value)} style={{ marginTop: 7, width: 140, border: '1px solid #D8E2DC', borderRadius: 8, padding: '9px 11px' }} />
    <span style={{ color: '#8AA89C', fontSize: 12, marginLeft: 10 }}>最低3天，最高30天</span>
    <div style={{ marginTop: 20, fontSize: 13, fontWeight: 700 }}>允许的履约方式</div>
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      {MODE_OPTIONS[type].map(([mode, label]) => <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}><input type="checkbox" checked={data[type].allowedModes.includes(mode)} onChange={() => toggleMode(type, mode)} />{label}</label>)}
    </div>
  </div>
  return <div className="page" style={{ maxWidth: 1120, margin: '0 auto' }}>
    <div className="page-header"><div><h1 className="page-title">药品与营养素定期补充流程</h1><p className="page-subtitle">统一配置提醒时间和履约分支；保存后新周期实时生效。</p></div><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '保存中...' : '保存并生效'}</button></div>
    <div style={{ padding: 14, borderRadius: 12, background: '#FFF8E8', color: '#765B18', fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>固定安全流程：信息采集 → AI风险草稿 → 专业人员审核 → 安排/执行 → 客户购买或签收确认。AI不能直接通过审核，医院配药必须预约。</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 18 }}>{typeCard('medication', '药品定期配药', '健康顾问')}{typeCard('supplement', '营养素定期补充', '营养师')}</div>
    <div style={{ ...card, marginTop: 18 }}>
      <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontWeight: 700 }}><input type="checkbox" checked={data.customerNotificationEnabled} onChange={e => setData(prev => ({ ...prev, customerNotificationEnabled: e.target.checked }))} />启动周期时通知客户</label>
      <label style={{ display: 'block', marginTop: 20, fontSize: 13, fontWeight: 700 }}>自研营养产品名称关键词</label>
      <textarea rows="4" value={(data.internalProductKeywords || []).join('\n')} onChange={e => setData(prev => ({ ...prev, internalProductKeywords: e.target.value.split('\n') }))} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, border: '1px solid #D8E2DC', borderRadius: 9, padding: 11 }} />
      <div style={{ color: '#8AA89C', fontSize: 12, marginTop: 6 }}>每行一个。只有名称命中关键词的营养素/代餐，才能选择“自研产品内部履约”；其他产品仍按线上第三方采购处理。</div>
    </div>
  </div>
}
