import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const box = { background: '#fff', border: '1px solid #DCE7E0', borderRadius: 14, padding: 18, display: 'grid', gap: 12 }
const label = { display: 'grid', gap: 5, fontSize: 13, fontWeight: 600, color: '#52685D' }

export default function NutritionAssessmentConfigPage() {
  const toast = useToast()
  const [config, setConfig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { adminAPI.getNutritionAssessmentConfig().then(result => setConfig(result.data)).catch(err => setError(err.message)) }, [])
  const set = (key, value) => setConfig(current => ({ ...current, [key]: value }))
  const save = async () => {
    setBusy(true)
    try { const result = await adminAPI.updateNutritionAssessmentConfig(config); setConfig(result.data); setError(''); toast('营养评估需求单设置已保存') }
    catch (err) { setError(err.message || '保存失败') }
    finally { setBusy(false) }
  }
  return <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
    <div className="page-header"><div><h1 className="page-title">营养评估需求单</h1><p className="page-subtitle">设置需求单和预约方式；单次已购订单由规划师转交，年度临时需求由顾问发起，再由健管预约、营养师评估。</p></div></div>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {!config ? <p>加载中…</p> : <div style={box}>
      <label style={{ fontWeight: 700 }}><input type="checkbox" checked={config.enabled === true} onChange={e => set('enabled', e.target.checked)} /> 启用营养评估需求单</label>
      <label style={label}>需求单名称<input className="form-input" maxLength={80} value={config.requestTitle || ''} onChange={e => set('requestTitle', e.target.value)} /></label>
      <label style={label}>发起人填写提示<textarea className="form-input" rows={2} maxLength={1000} value={config.requestInstructions || ''} onChange={e => set('requestInstructions', e.target.value)} /></label>
      <label style={label}>健管预约提示<textarea className="form-input" rows={2} maxLength={1000} value={config.bookingInstructions || ''} onChange={e => set('bookingInstructions', e.target.value)} /></label>
      <label style={label}>营养师评估提示<textarea className="form-input" rows={2} maxLength={1000} value={config.assessmentInstructions || ''} onChange={e => set('assessmentInstructions', e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 20 }}><label><input type="checkbox" checked={config.onlineEnabled === true} onChange={e => set('onlineEnabled', e.target.checked)} /> 线上 · 腾讯会议室</label><label><input type="checkbox" checked={config.offlineEnabled === true} onChange={e => set('offlineEnabled', e.target.checked)} /> 线下门店</label></div>
      <div style={{ padding: 12, background: '#F1F8F4', color: '#52685D', fontSize: 13 }}>必填字段固定为评估原因、预约日期和时间、预约方式与地点、评估结论、后续建议。岗位和顺序由服务端校验。</div>
      <div><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存设置'}</button></div>
    </div>}
  </div>
}
