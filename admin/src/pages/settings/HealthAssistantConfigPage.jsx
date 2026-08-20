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
  const longFields = new Set(['plannerCardSubtitle','greeting','disclaimer','transferText'])
  const sectionStyle = { background:'#fff', border:'1px solid #E7ECE9', borderRadius:16, padding:24, boxShadow:'0 5px 18px rgba(26,43,36,.05)' }
  const fieldStyle = { width:'100%', boxSizing:'border-box', border:'1px solid #DCE5E0', borderRadius:10, padding:'11px 13px', fontSize:14, lineHeight:1.6, background:'#FBFCFB' }
  return <div className="page" style={{maxWidth:1180,margin:'0 auto'}}>
    <div className="page-header"><div><h1 className="page-title">健康助手配置</h1><p className="page-subtitle">统一管理小程序入口、开场文案和 AI 沟通规则，保存后实时生效。</p></div><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '保存中...' : '保存并生效'}</button></div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(300px,.42fr)',gap:20,alignItems:'start'}}>
      <div style={sectionStyle}><h3 style={{margin:'0 0 18px'}}>基础展示与沟通文案</h3><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:18}}>
        {fields.map(([key,label])=><label key={key} style={{display:'block',gridColumn:longFields.has(key)?'1 / -1':'auto'}}><span style={{display:'block',fontSize:13,fontWeight:700,marginBottom:7,color:'#344B40'}}>{label}</span>{longFields.has(key)?<textarea rows="3" value={data[key]||''} onChange={e=>set(key,e.target.value)} style={{...fieldStyle,resize:'vertical'}}/>:<input value={data[key]||''} onChange={e=>set(key,e.target.value)} style={fieldStyle}/>}</label>)}
      </div></div>
      <div style={{display:'grid',gap:20}}>
        <div style={sectionStyle}><h3 style={{margin:'0 0 12px'}}>快捷问题</h3><p style={{fontSize:12,color:'#8AA89C'}}>每行一个，最多 6 个，将显示在健康规划师对话顶部。</p><textarea rows="8" value={(data.quickPrompts||[]).join('\n')} onChange={e=>set('quickPrompts',e.target.value.split('\n').slice(0,6))} style={{...fieldStyle,resize:'vertical'}}/></div>
        <div style={sectionStyle}><h3 style={{margin:'0 0 12px'}}>AI 运营规则</h3><textarea rows="12" value={data.behaviorPrompt||''} onChange={e=>set('behaviorPrompt',e.target.value)} style={{...fieldStyle,resize:'vertical'}}/><small style={{display:'block',color:'#8AA89C',marginTop:8,lineHeight:1.6}}>仅用于服务定位和沟通策略；诊断、用药与紧急风险等安全边界由系统固定保护。</small></div>
      </div>
    </div>
  </div>
}
