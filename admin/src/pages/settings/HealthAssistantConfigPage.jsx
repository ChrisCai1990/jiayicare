import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const fields = [
  ['plannerName', '健康规划师名称'], ['teamName', '健康服务团队名称'],
  ['aiOnlineLabel', 'AI 在线文案'], ['humanOnlineLabel', '人工在线文案'],
  ['plannerCardTitle', '入口标题'], ['plannerCardSubtitle', '入口说明'],
  ['greeting', '首次开场语'], ['disclaimer', '免责声明'], ['transferText', '转人工提示'],
]

export default function HealthAssistantConfigPage() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { adminAPI.getHealthAssistantConfig().then(r => setData(r.data)).catch(e => toast(e.message)) }, [])
  const set = (key, value) => setData(prev => ({ ...prev, [key]: value }))
  const save = async () => {
    setSaving(true)
    try { const r = await adminAPI.updateHealthAssistantConfig(data); setData(r.data); toast('已保存，小程序实时生效') }
    catch (e) { toast(e.message) } finally { setSaving(false) }
  }
  if (!data) return <div className="page-loading">加载中...</div>
  return <div className="page">
    <div className="page-header"><div><h1 className="page-title">健康助手配置</h1><p className="page-subtitle">名称、入口文案、开场语和AI规则保存后由小程序动态读取，无需重新提交微信审核</p></div><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '保存中...' : '保存并生效'}</button></div>
    <div className="card"><div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
      {fields.map(([key, label]) => <label key={key} style={{ display: 'block', gridColumn: ['plannerCardSubtitle','greeting','disclaimer','transferText'].includes(key) ? '1 / -1' : 'auto' }}><span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>{label}</span>{['plannerCardSubtitle','greeting','disclaimer','transferText'].includes(key) ? <textarea className="form-control" rows="3" value={data[key] || ''} onChange={e => set(key, e.target.value)} /> : <input className="form-control" value={data[key] || ''} onChange={e => set(key, e.target.value)} />}</label>)}
      <label style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>快捷问题（每行一个，最多6个）</span><textarea className="form-control" rows="5" value={(data.quickPrompts || []).join('\n')} onChange={e => set('quickPrompts', e.target.value.split('\n'))} /></label>
      <label style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>AI运营规则</span><textarea className="form-control" rows="8" value={data.behaviorPrompt || ''} onChange={e => set('behaviorPrompt', e.target.value)} /><small style={{ color: '#8AA89C' }}>可调整服务定位和沟通策略；诊断、用药及紧急风险等安全底线由系统固定保护。</small></label>
    </div></div>
  </div>
}
