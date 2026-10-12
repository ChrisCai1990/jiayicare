import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'

const KIND_LABEL = {
  annual_plan: '年度方案', quarterly_review: '季度复盘',
  annual_review: '年度复盘', other: '其他记录',
}
const PERIOD_LABEL = { annual: '全年', Q1: '第一季度', Q2: '第二季度', Q3: '第三季度', Q4: '第四季度' }

export default function EnterpriseServiceRecordsModal({ enterprise, onClose, toast }) {
  const currentYear = new Date().getFullYear()
  const [records, setRecords] = useState([])
  const [year, setYear] = useState(currentYear)
  const [kind, setKind] = useState('annual_plan')
  const [period, setPeriod] = useState('annual')
  const [title, setTitle] = useState('年度服务方案')
  const [summary, setSummary] = useState('')
  const [file, setFile] = useState(null)
  const [publish, setPublish] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const result = await adminAPI.enterpriseServiceRecords(enterprise._id)
      setRecords(result.data || [])
    } catch (err) { toast('❌ 服务记录加载失败：' + err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [enterprise._id])

  const changeKind = (value) => {
    setKind(value)
    setPeriod(value === 'quarterly_review' ? 'Q1' : 'annual')
    setTitle(KIND_LABEL[value])
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!file) { toast('请选择PDF或PPTX文件'); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('year', String(year))
      form.append('kind', kind)
      form.append('period', period)
      form.append('title', title.trim())
      form.append('summary', summary.trim())
      form.append('publish', String(publish))
      form.append('file', file)
      await adminAPI.uploadEnterpriseServiceRecord(enterprise._id, form)
      toast(publish ? '✅ 服务记录已上传，企业HR可见' : '✅ 服务记录已保存为待发布')
      setFile(null)
      setSummary('')
      const picker = document.getElementById('enterprise-service-record-file')
      if (picker) picker.value = ''
      await load()
    } catch (err) { toast('❌ ' + err.message) }
    finally { setBusy(false) }
  }

  const setVisibility = async (record) => {
    setBusy(true)
    try {
      await adminAPI.publishEnterpriseServiceRecord(enterprise._id, record._id, !record.publishedAt)
      await load()
      toast(record.publishedAt ? '✅ 已取消企业可见' : '✅ 企业HR现在可以查看')
    } catch (err) { toast('❌ ' + err.message) }
    finally { setBusy(false) }
  }

  const download = async (record) => {
    try { await adminAPI.downloadEnterpriseServiceRecord(enterprise._id, record._id, record.fileName) }
    catch (err) { toast('❌ ' + err.message) }
  }

  const filtered = records.filter(record => record.year === Number(year))
  const years = [...new Set([currentYear, Number(year), ...records.map(record => record.year)])].sort((a, b) => b - a)

  return (
    <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div className="modal-title">📁 {enterprise.name} · 服务记录</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <p style={{ color: '#65776F', fontSize: 13, marginTop: 0 }}>
            按年度保存方案与季度复盘。发布后仅该企业HR账号可在对应年度查看；请上传企业汇总文件，不放个人诊疗资料。
          </p>
          <form onSubmit={submit} style={{ border: '1px solid #E0E8E3', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>新增服务记录</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="form-group"><span className="form-label">服务年度</span><input className="form-input" type="number" min="2020" max="2099" value={year} onChange={event => setYear(event.target.value)} required /></label>
              <label className="form-group"><span className="form-label">记录类型</span><select className="form-input" value={kind} onChange={event => changeKind(event.target.value)}>{Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="form-group"><span className="form-label">归属期间</span><select className="form-input" value={period} onChange={event => setPeriod(event.target.value)}>{Object.entries(PERIOD_LABEL).filter(([value]) => kind === 'quarterly_review' ? value !== 'annual' : kind === 'other' || value === 'annual').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="form-group"><span className="form-label">标题</span><input className="form-input" maxLength="120" value={title} onChange={event => setTitle(event.target.value)} required /></label>
              <label className="form-group" style={{ gridColumn: '1/-1' }}><span className="form-label">简要说明（可选）</span><textarea className="form-input" rows={2} maxLength="2000" value={summary} onChange={event => setSummary(event.target.value)} placeholder="例如：本季度服务开展情况与下一步安排" /></label>
              <label className="form-group" style={{ gridColumn: '1/-1' }}><span className="form-label">上传文件（PDF或PPTX，最多20MB）</span><input id="enterprise-service-record-file" className="form-input" type="file" accept=".pdf,.pptx" onChange={event => setFile(event.target.files?.[0] || null)} required /></label>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 14px', fontSize: 13 }}><input type="checkbox" checked={publish} onChange={event => setPublish(event.target.checked)} />上传后立即对企业HR可见</label>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '处理中...' : '上传记录'}</button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <b>历年记录</b>
            <select className="form-input" style={{ width: 130 }} value={year} onChange={event => setYear(event.target.value)}>{years.map(value => <option key={value} value={value}>{value} 年</option>)}</select>
          </div>
          {loading && <div style={{ color: '#888' }}>加载中...</div>}
          {!loading && filtered.length === 0 && <div style={{ color: '#888', padding: 12 }}>该年度暂无服务记录</div>}
          {filtered.map(record => (
            <div key={record._id} style={{ borderTop: '1px solid #EEE', padding: '12px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{PERIOD_LABEL[record.period]} · {KIND_LABEL[record.kind]} · {record.title}</div>
                {record.summary && <div style={{ color: '#65776F', fontSize: 13, marginTop: 5 }}>{record.summary}</div>}
                <div style={{ color: '#888', fontSize: 12, marginTop: 5 }}>{record.fileName} · {new Date(record.createdAt).toLocaleDateString('zh-CN')} · {record.publishedAt ? '企业可见' : '待发布'}</div>
              </div>
              <button className="btn btn-sm btn-ghost" type="button" onClick={() => download(record)}>下载</button>
              <button className="btn btn-sm btn-secondary" type="button" disabled={busy} onClick={() => setVisibility(record)}>{record.publishedAt ? '取消发布' : '发布'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
