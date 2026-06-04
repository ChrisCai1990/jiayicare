import React, { useEffect, useState, useCallback } from 'react'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'
import FollowUpModal from '../components/FollowUpModal'

const TYPE_LABEL = {
  disease_mgmt:  '专病管理记录',
  nutrition:     '营养干预记录',
  medical_visit: '医院就医记录',
  routine:       '日常随访记录',
  // 旧类型兼容
  medical_escort:'就医协助', psychology:'心理咨询', rehab:'运动复健', tcm:'中医评估', specialist:'专科会诊',
}
const TYPE_COLOR = {
  disease_mgmt:'#e74c3c', nutrition:'#27ae60', medical_visit:'#0077B6', routine:'#D97706',
  medical_escort:'#0077B6', psychology:'#8e44ad', rehab:'#27ae60', tcm:'#e67e22', specialist:'#e74c3c',
}

const ROLE_DEFAULT = { medicalAssistant:'medical_visit', psychologist:'routine', rehabSpecialist:'routine', tcmDoctor:'disease_mgmt', specialist:'disease_mgmt' }

export default function ServiceRecordsPage() {
  const { staff } = useStaff()
  const toast = useToast()
  const defaultType = ROLE_DEFAULT[staff?.role] || ''
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState(defaultType)
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [followUpTarget, setFollowUpTarget] = useState(null) // { patientId, patientName, theme }
  const [patients, setPatients] = useState([])
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getServiceRecords({ type: typeFilter, page, limit })
      setRecords(res.data.records); setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [typeFilter, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { staffAPI.getPatients({ limit: 200 }).then(r => setPatients(r.data.patients)).catch(() => {}) }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除？')) return
    try { await staffAPI.deleteServiceRecord(id); toast('已删除'); load() }
    catch (err) { toast(err.message) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">服务记录</h1>
          <p className="page-subtitle">共 {total} 条记录</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ 新增记录</button>
      </div>

      {/* 类型筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { v: '', l: '全部' },
          { v: 'disease_mgmt',  l: '专病管理' },
          { v: 'nutrition',     l: '营养干预' },
          { v: 'medical_visit', l: '医院就医' },
          { v: 'routine',       l: '日常随访' },
        ].map(opt => (
          <button key={opt.v} className={`btn btn-sm ${typeFilter === opt.v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTypeFilter(opt.v); setPage(1) }}>{opt.l}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : records.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无记录</div>
        : <table className="table">
            <thead><tr><th>类型</th><th>会员</th><th>日期</th><th>主题</th><th>内容摘要</th><th>操作</th></tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r._id}>
                  <td>
                    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: (TYPE_COLOR[r.type] || '#666') + '20', color: TYPE_COLOR[r.type] || '#666' }}>
                      {TYPE_LABEL[r.type] || r.type}
                    </span>
                  </td>
                  <td>{r.patientId?.name} <div style={{ fontSize: 11, color: '#aaa' }}>{r.patientId?.phone}</div></td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>{new Date(r.date).toLocaleDateString('zh-CN')}</td>
                  <td style={{ fontWeight: 500 }}>{r.title || '-'}</td>
                  <td style={{ maxWidth: 220, fontSize: 13, color: '#4A6558' }}>
                    {r.content ? (r.content.length > 45 ? r.content.slice(0, 45) + '...' : r.content) : '-'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                      onClick={() => setFollowUpTarget({ patientId: r.patientId?._id || r.patientId, patientName: r.patientId?.name || '', theme: r.subject || TYPE_LABEL[r.type] || '' })}>
                      新建随访
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r._id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>

      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', fontSize: 14, color: '#666' }}>第 {page} / {Math.ceil(total / limit)} 页</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {showModal && (
        <ServiceRecordModal patients={patients} defaultType={defaultType || 'disease_mgmt'}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); toast('记录已保存'); load() }} />
      )}

      {followUpTarget && (
        <FollowUpModal
          patientId={followUpTarget.patientId}
          patientName={followUpTarget.patientName}
          defaultTheme={followUpTarget.theme}
          onClose={() => setFollowUpTarget(null)}
          onSaved={() => { setFollowUpTarget(null); toast('随访计划已创建') }}
        />
      )}
    </div>
  )
}

// ── 字段配置 ──
const DISEASE_MGMT_FIELDS = [
  { key: 'hospital', label: '医院', type: 'text' },
  { key: 'department', label: '科室', type: 'text' },
  { key: 'doctor', label: '医生', type: 'text' },
  { key: 'result', label: '检查结果', type: 'textarea', placeholder: '检查结论、影像学结果等' },
  { key: 'medication', label: '用药意见', type: 'textarea' },
  { key: 'monthlyPlan', label: '本月管理方案', type: 'textarea' },
]
const NUTRITION_FIELDS = [
  { key: 'weightChange', label: '体重变化 (kg)', type: 'text', placeholder: '如：-0.5' },
  { key: 'dietRecord', label: '饮食记录', type: 'textarea', placeholder: '饮食种类、份量、频率...' },
  { key: 'exerciseRecord', label: '运动记录', type: 'textarea', placeholder: '运动类型、时长...' },
  { key: 'sleepRecord', label: '睡眠记录', type: 'textarea', placeholder: '时长、质量...' },
  { key: 'waterRecord', label: '饮水记录', type: 'textarea', placeholder: '每日饮水量、习惯...' },
  { key: 'alcoholRecord', label: '饮酒记录', type: 'textarea', placeholder: '频率、种类、饮用量...' },
  { key: 'bowelRecord', label: '排便记录', type: 'textarea', placeholder: '频率、性状、异常情况...' },
  { key: 'weeklySummary', label: '本周总结与建议', type: 'textarea' },
]
const MEDICAL_VISIT_FIELDS = [
  { key: 'hospital', label: '医院', type: 'text' },
  { key: 'department', label: '科室', type: 'text' },
  { key: 'doctor', label: '医生', type: 'text' },
  { key: 'reason', label: '就医原因', type: 'textarea' },
  { key: 'result', label: '检查结果', type: 'textarea', placeholder: '检查结论、影像学结果等' },
  { key: 'expertAnalysis', label: '专家分析', type: 'textarea' },
  { key: 'guidance', label: '指导意见', type: 'textarea' },
  { key: 'followupPlan', label: '随访计划', type: 'textarea', placeholder: '下次就医/复查时间及内容' },
]
const ROUTINE_PERIODS = ['双周', '月度', '季度']
const ROUTINE_METHODS = ['电话', '微信', '线下', '视频']

function ServiceRecordModal({ patients, defaultType, onClose, onSaved }) {
  const [type, setType] = useState(defaultType)
  const [patientId, setPatientId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [extras, setExtras] = useState({})  // type-specific fields
  const [routinePeriod, setRoutinePeriod] = useState('月度')
  const [routineMethod, setRoutineMethod] = useState('电话')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setExtra = (k, v) => setExtras(prev => ({ ...prev, [k]: v }))

  const buildContent = () => {
    if (type === 'disease_mgmt') {
      return [
        extras.hospital && `医院：${extras.hospital}`,
        extras.department && `科室：${extras.department}`,
        extras.doctor && `医生：${extras.doctor}`,
        extras.result && `检查结果：${extras.result}`,
        extras.medication && `用药意见：${extras.medication}`,
        extras.monthlyPlan && `本月方案：${extras.monthlyPlan}`,
      ].filter(Boolean).join('\n')
    }
    if (type === 'nutrition') {
      return [
        extras.weightChange && `体重变化：${extras.weightChange}kg`,
        extras.dietRecord && `饮食记录：${extras.dietRecord}`,
        extras.exerciseRecord && `运动记录：${extras.exerciseRecord}`,
        extras.sleepRecord && `睡眠记录：${extras.sleepRecord}`,
        extras.waterRecord && `饮水记录：${extras.waterRecord}`,
        extras.alcoholRecord && `饮酒记录：${extras.alcoholRecord}`,
        extras.bowelRecord && `排便记录：${extras.bowelRecord}`,
        extras.weeklySummary && `总结建议：${extras.weeklySummary}`,
      ].filter(Boolean).join('\n')
    }
    if (type === 'medical_visit') {
      return [
        extras.hospital && `医院：${extras.hospital}`,
        extras.department && `科室：${extras.department}`,
        extras.doctor && `医生：${extras.doctor}`,
        extras.reason && `就医原因：${extras.reason}`,
        extras.result && `检查结果：${extras.result}`,
        extras.expertAnalysis && `专家分析：${extras.expertAnalysis}`,
        extras.guidance && `指导意见：${extras.guidance}`,
        extras.followupPlan && `随访计划：${extras.followupPlan}`,
      ].filter(Boolean).join('\n')
    }
    if (type === 'routine') {
      return [
        `周期：${routinePeriod}`,
        `方式：${routineMethod}`,
        extras.mainContent && `沟通内容：${extras.mainContent}`,
        extras.feedback && `会员反馈：${extras.feedback}`,
        extras.adjustment && `方案调整：${extras.adjustment}`,
      ].filter(Boolean).join('\n')
    }
    return extras.content || ''
  }

  const handleSubmit = async () => {
    if (!patientId) { setError('请选择会员'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createServiceRecord({
        patientId,
        type,
        date,
        title: title || (TYPE_LABEL[type] + ' · ' + new Date(date).toLocaleDateString('zh-CN')),
        content: buildContent(),
        result: extras.result || '',
        medicalEscort: { hospital: extras.hospital || '', department: extras.department || '', doctor: extras.doctor || '' },
      })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const renderFields = () => {
    if (type === 'disease_mgmt') return DISEASE_MGMT_FIELDS.map(f => (
      <div key={f.key} className="form-group" style={{ marginBottom: 10 }}>
        <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
        {f.type === 'textarea'
          ? <textarea className="form-input" rows={2} value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} style={{ resize: 'vertical' }} />
          : <input className="form-input" value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} />}
      </div>
    ))
    if (type === 'nutrition') return NUTRITION_FIELDS.map(f => (
      <div key={f.key} className="form-group" style={{ marginBottom: 10 }}>
        <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
        {f.type === 'textarea'
          ? <textarea className="form-input" rows={2} placeholder={f.placeholder || ''} value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} style={{ resize: 'vertical' }} />
          : <input className="form-input" placeholder={f.placeholder || ''} value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} />}
      </div>
    ))
    if (type === 'medical_visit') return MEDICAL_VISIT_FIELDS.map(f => (
      <div key={f.key} className="form-group" style={{ marginBottom: 10 }}>
        <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
        {f.type === 'textarea'
          ? <textarea className="form-input" rows={2} placeholder={f.placeholder || ''} value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} style={{ resize: 'vertical' }} />
          : <input className="form-input" value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} />}
      </div>
    ))
    if (type === 'routine') return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12 }}>随访周期</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ROUTINE_PERIODS.map(p => (
                <button key={p} type="button" onClick={() => setRoutinePeriod(p)}
                  style={{ flex: 1, padding: '6px 4px', borderRadius: 6, border: `1px solid ${routinePeriod === p ? '#1E6B50' : '#E0D9CE'}`,
                    background: routinePeriod === p ? '#1E6B50' : '#f9f7f3', color: routinePeriod === p ? '#fff' : '#4A6558', fontSize: 12, cursor: 'pointer' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="form-label" style={{ fontSize: 12 }}>随访方式</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ROUTINE_METHODS.map(m => (
                <button key={m} type="button" onClick={() => setRoutineMethod(m)}
                  style={{ flex: 1, padding: '6px 2px', borderRadius: 6, border: `1px solid ${routineMethod === m ? '#1E6B50' : '#E0D9CE'}`,
                    background: routineMethod === m ? '#1E6B50' : '#f9f7f3', color: routineMethod === m ? '#fff' : '#4A6558', fontSize: 11, cursor: 'pointer' }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        {[
          { key: 'mainContent', label: '主要沟通内容', rows: 3 },
          { key: 'feedback', label: '会员反馈', rows: 2 },
          { key: 'adjustment', label: '是否需要调整方案', rows: 2 },
        ].map(f => (
          <div key={f.key} className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
            <textarea className="form-input" rows={f.rows} value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        ))}
      </>
    )
    return null
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">新增服务记录</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 会员 + 日期 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">选择会员 *</label>
              <select className="form-input" value={patientId} onChange={e => setPatientId(e.target.value)}>
                <option value="">-- 请选择会员 --</option>
                {patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">记录日期</label>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">标题（可选）</label>
              <input className="form-input" placeholder="自动生成" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
          </div>

          {/* 类型选择 */}
          <div>
            <label className="form-label">记录类型 *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { v: 'disease_mgmt', l: '专病管理', icon: '🏥' },
                { v: 'nutrition',    l: '营养干预', icon: '🥗' },
                { v: 'medical_visit',l: '医院就医', icon: '🩺' },
                { v: 'routine',      l: '日常随访', icon: '📋' },
              ].map(t => (
                <button key={t.v} type="button" onClick={() => { setType(t.v); setExtras({}) }}
                  style={{ padding: '10px 6px', borderRadius: 8, border: `1px solid ${type === t.v ? '#1E6B50' : '#E0D9CE'}`,
                    background: type === t.v ? '#1E6B50' : '#f9f7f3', color: type === t.v ? '#fff' : '#4A6558',
                    cursor: 'pointer', fontSize: 12, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 20 }}>{t.icon}</span>{t.l}
                </button>
              ))}
            </div>
          </div>

          {/* 分割线 */}
          <div style={{ borderTop: '1px solid #E0D9CE', paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1E6B50', marginBottom: 10 }}>
              {TYPE_LABEL[type]}
            </div>
            {renderFields()}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '保存中...' : '保存记录'}</button>
        </div>
      </div>
    </div>
  )
}
