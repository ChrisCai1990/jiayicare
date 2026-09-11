import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const maskId = value => value ? `${value.slice(0, 4)}…${value.slice(-6)}` : '未知标识'
const formatTime = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未知时间'

// 微信客服外部身份只能人工核对、明确授权后关联，绝不按昵称、手机号或聊天内容自动匹配。
export default function WecomKfBindingPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState([])
  const [patient, setPatient] = useState(null)
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true); setError('')
    return staffAPI.getWecomKfUnboundContacts()
      .then(r => setRows(r.data || []))
      .catch(e => setError(e.message || '无法读取待绑定客户'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    let active = true
    if (!query.trim()) { setPatients([]); return () => { active = false } }
    const timer = window.setTimeout(() => {
      staffAPI.getPatients({ search: query.trim(), limit: 8 })
        .then(r => { if (active) setPatients(r.data?.patients || []) })
        .catch(() => { if (active) setPatients([]) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query])

  const start = row => {
    setSelected(row); setPatient(null); setQuery(''); setPatients([]); setConsent(false); setError('')
  }
  const bind = async () => {
    if (!selected || !patient || !consent) return
    setSaving(true); setError('')
    try {
      await staffAPI.bindWecomKfContact({ patientId: patient._id, externalUserId: selected.externalUserId, consentConfirmed: true })
      setRows(old => old.filter(row => row.externalUserId !== selected.externalUserId))
      setSelected(null); setPatient(null); setQuery(''); setConsent(false)
    } catch (e) { setError(e.message || '绑定失败') }
    finally { setSaving(false) }
  }

  return <section className="sa-card" aria-label="微信客服客户绑定">
    <div className="sa-row" style={{ alignItems: 'center' }}>
      <div><h2>微信客服客户绑定</h2><small>只显示尚未绑定档案的客服身份，不显示聊天内容。</small></div>
      <button type="button" onClick={load} disabled={loading || saving}>刷新</button>
    </div>
    {error && <div className="sa-alert" role="alert">{error}</div>}
    {loading ? <small>正在读取待绑定客户…</small> : rows.length === 0 ? <small>暂无待绑定的微信客服客户。</small> : <div>
      {rows.map(row => <div className="sa-kf-row" key={row.externalUserId}>
        <div><strong>客服客户 {maskId(row.externalUserId)}</strong><small>最近消息：{formatTime(row.lastMessageAt)}</small></div>
        <button type="button" onClick={() => start(row)} disabled={saving}>核对并绑定</button>
      </div>)}
    </div>}
    {selected && <div className="sa-kf-bind">
      <strong>绑定 {maskId(selected.externalUserId)}</strong>
      <small>请先在企业微信客服后台打开该会话，人工核对客户身份；不能按昵称、手机号或聊天内容猜测。</small>
      <label>搜索嘉医汇客户
        <input value={query} onChange={e => { setQuery(e.target.value); setPatient(null) }} placeholder="姓名或手机号" disabled={saving} />
      </label>
      {patients.map(item => <button type="button" className="sa-kf-patient" key={item._id} onClick={() => { setPatient(item); setQuery(item.name || '') }} disabled={saving}>
        {item.preferredTitle || item.name}{item.phone ? ` · ${item.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')}` : ''}
      </button>)}
      {patient && <small>已选择：{patient.preferredTitle || patient.name}</small>}
      <label className="sa-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={saving} />我已确认客户同意将该微信客服会话关联至所选嘉医汇档案</label>
      <div className="sa-actions"><button type="button" className="sa-primary" onClick={bind} disabled={!patient || !consent || saving}>{saving ? '正在绑定…' : '确认绑定'}</button><button type="button" onClick={() => setSelected(null)} disabled={saving}>取消</button></div>
    </div>}
  </section>
}
