import React, { useEffect, useState, useCallback, useRef } from 'react'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'
import FollowUpModal from '../components/FollowUpModal'

function PatientSearchInput({ value, onChange }) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const timerRef = useRef(null)
  const wrapRef = useRef(null)
  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const handleInput = e => {
    const kw = e.target.value; setKeyword(kw); setOpen(true)
    if (!kw.trim()) { setResults([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try { const r = await staffAPI.getPatients({ search: kw, limit: 20 }); setResults(r.data.patients || []) }
      catch { setResults([]) } finally { setSearching(false) }
    }, 300)
  }
  const handleSelect = p => { onChange(p._id); setSelectedName(`${p.name}  ${p.phone}`); setKeyword(''); setResults([]); setOpen(false) }
  const handleClear = () => { onChange(''); setSelectedName(''); setKeyword(''); setResults([]) }
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {value && selectedName ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid #1E6B50', borderRadius: 8, background: '#E8F5EF', fontSize: 14 }}>
          <span><span style={{ fontWeight: 600 }}>{selectedName.split('  ')[0]}</span><span style={{ color: '#8AA89C', marginLeft: 8, fontSize: 13 }}>{selectedName.split('  ')[1]}</span></span>
          <button type="button" onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 0 }}>✕</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input className="form-input" type="text" value={keyword} onChange={handleInput} onFocus={() => keyword && setOpen(true)} placeholder="输入姓名或手机号搜索会员..." autoComplete="off" />
          {searching && <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#aaa' }}>搜索中...</div>}
          {open && results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
              {results.map(p => (
                <div key={p._id} onMouseDown={() => handleSelect(p)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f2ec' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span><span style={{ color: '#8AA89C', marginLeft: 8 }}>{p.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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
  const [patientFilter, setPatientFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [followUpTarget, setFollowUpTarget] = useState(null) // { patientId, patientName, theme }
  const [detailRecord, setDetailRecord] = useState(null)
  const [patients, setPatients] = useState([])
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { type: typeFilter, page, limit }
      if (patientFilter) params.patientId = patientFilter
      const res = await staffAPI.getServiceRecords(params)
      setRecords(res.data.records); setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [typeFilter, patientFilter, page])

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

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { v: '', l: '全部类型' },
          { v: 'disease_mgmt',  l: '专病管理' },
          { v: 'nutrition',     l: '营养干预' },
          { v: 'medical_visit', l: '医院就医' },
          { v: 'routine',       l: '日常随访' },
        ].map(opt => (
          <button key={opt.v} className={`btn btn-sm ${typeFilter === opt.v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTypeFilter(opt.v); setPage(1) }}>{opt.l}</button>
        ))}
        <div style={{ flex: 1, minWidth: 200, maxWidth: 280 }}>
          <PatientSearchInput value={patientFilter} onChange={v => { setPatientFilter(v); setPage(1) }} />
        </div>
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
                      onClick={() => setDetailRecord(r)}>
                      查看
                    </button>
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

      {detailRecord && (
        <div className="modal-overlay" onClick={() => setDetailRecord(null)}>
          <div className="modal" style={{ maxWidth: 600, width: '96%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">服务记录详情</div>
              <button className="modal-close" onClick={() => setDetailRecord(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><span style={{ fontSize: 12, color: '#8AA89C' }}>会员</span><div style={{ fontWeight: 600, marginTop: 2 }}>{detailRecord.patientId?.name} · {detailRecord.patientId?.phone}</div></div>
                <div><span style={{ fontSize: 12, color: '#8AA89C' }}>类型</span><div style={{ marginTop: 2 }}><span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: (TYPE_COLOR[detailRecord.type] || '#666') + '20', color: TYPE_COLOR[detailRecord.type] || '#666' }}>{TYPE_LABEL[detailRecord.type] || detailRecord.type}</span></div></div>
                <div><span style={{ fontSize: 12, color: '#8AA89C' }}>日期</span><div style={{ marginTop: 2 }}>{new Date(detailRecord.date).toLocaleDateString('zh-CN')}</div></div>
                <div><span style={{ fontSize: 12, color: '#8AA89C' }}>主题</span><div style={{ fontWeight: 500, marginTop: 2 }}>{detailRecord.title || '-'}</div></div>
              </div>
              {detailRecord.content && (
                <div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 6 }}>完整内容</div>
                  <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 14, fontSize: 13, color: '#1A2B24', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{detailRecord.content}</div>
                </div>
              )}
              {detailRecord.staffId?.name && (
                <div style={{ fontSize: 12, color: '#8AA89C' }}>记录人：{detailRecord.staffId.name}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setDetailRecord(null)}>关闭</button>
            </div>
          </div>
        </div>
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

// ── 双周随访表单 ────────────────────────────────────────────────
function BiWeeklyForm({ extras, setExtra }) {
  const E = (k, label, type='text', placeholder='', options) => (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label className="form-label" style={{ fontSize: 12 }}>{label}</label>
      {type === 'select' ? (
        <select className="form-input" value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)}>
          <option value="">请选择</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea className="form-input" rows={2} placeholder={placeholder} value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)} style={{ resize: 'vertical' }} />
      ) : (
        <input className="form-input" placeholder={placeholder} value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)} />
      )}
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <Section13 title="当前重点关注">
        {E('bi_focus', '当前重点关注事项', 'textarea')}
      </Section13>

      <Section13 title="微行动计划反馈（最多3项）">
        {[1,2,3].map(n => (
          <div key={n} style={{ background: '#f9f7f3', borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 6 }}>行动 {n}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {E(`bi_a${n}_desc`, '具体描述', 'text')}
              {E(`bi_a${n}_done`, '完成情况', 'select', '', ['完成', '部分完成', '未做'])}
              {E(`bi_a${n}_diff`, '遇到的困难', 'text')}
              {E(`bi_a${n}_eff`, '效果感受', 'select', '', ['好', '中', '差'])}
            </div>
          </div>
        ))}
      </Section13>

      <Section13 title="关键指标快照">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {E('bi_weight_trend', '体重趋势', 'select', '', ['下降', '稳定', '上升'])}
          {E('bi_weight_val', '体重数值 (kg)', 'text')}
          {E('bi_bp', '血压情况', 'text', '如：120/80')}
          {E('bi_sleep', '睡眠评分', 'select', '', ['良好', '一般', '较差'])}
          {E('bi_bowel', '大便情况', 'select', '', ['规律', '偶有异常', '持续异常'])}
          {E('bi_energy', '主观精力', 'select', '', ['充沛', '一般', '疲乏'])}
          {E('bi_mood', '情绪状态', 'select', '', ['良好', '一般', '较差'])}
        </div>
        {E('bi_discomfort', '新发不适', 'textarea', '如无请填"无"')}
      </Section13>

      <Section13 title="药物及营养素补充">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {E('bi_med_use', '是否服药', 'select', '', ['是', '否'])}
          {E('bi_med_regular', '服药规律性', 'select', '', ['规律', '偶尔漏服', '经常漏服'])}
          {E('bi_med_reaction', '不良反应', 'text', '如无请填"无"')}
          {E('bi_med_other', '其他药物', 'text')}
          {E('bi_supp_use', '是否用营养素', 'select', '', ['是', '否'])}
          {E('bi_supp_regular', '营养素规律性', 'select', '', ['规律', '偶尔漏服', '经常漏服'])}
          {E('bi_supp_effect', '改善情况', 'select', '', ['明显改善', '略有改善', '无变化'])}
          {E('bi_supp_other', '其他营养素', 'text')}
        </div>
      </Section13>

      <Section13 title="周期生活事件影响">
        {E('bi_events', '影响健康计划的生活事件', 'text', '如出差、应酬、情绪波动等')}
        {E('bi_impact', '对健康计划的影响', 'textarea')}
        {E('bi_challenge', '当前最大挑战', 'textarea')}
        {E('bi_support', '最需要的支持', 'textarea')}
      </Section13>

      <Section13 title="下两周微调方案">
        {E('bi_keep', '保持项', 'textarea')}
        {E('bi_adjust', '调整项', 'textarea')}
        {E('bi_attention', '特别关注提醒', 'textarea')}
      </Section13>

      <Section13 title="快速记录">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {E('bi_comm_status', '沟通状态', 'select', '', ['顺畅', '一般', '困难'])}
          {E('bi_urgency', '紧急度', 'select', '', ['正常', '需关注', '紧急'])}
          {E('bi_next_focus', '下期随访重点', 'text')}
          {E('bi_staff', '随访人员', 'text')}
          {E('bi_duration', '随访时长(分钟)', 'text')}
          {E('bi_next_date', '预约下次随访日期', 'text', 'YYYY-MM-DD')}
        </div>
      </Section13>
    </div>
  )
}

// ── 月度随访表单 ────────────────────────────────────────────────
function MonthlyForm({ extras, setExtra }) {
  const E = (k, label, type='text', placeholder='', options) => (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label className="form-label" style={{ fontSize: 12 }}>{label}</label>
      {type === 'select' ? (
        <select className="form-input" value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)}>
          <option value="">请选择</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea className="form-input" rows={2} placeholder={placeholder} value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)} style={{ resize: 'vertical' }} />
      ) : (
        <input className="form-input" placeholder={placeholder} value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)} />
      )}
    </div>
  )
  return (
    <div>
      <Section13 title="本月核心目标回顾">
        {E('mo_goal_review', '本月核心目标回顾', 'textarea')}
      </Section13>

      <Section13 title="月度核心指标追踪">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {E('mo_weight', '体重 (kg)', 'text')}
          {E('mo_weight_diff', '对比上月', 'text', '如：-0.5kg')}
          {E('mo_exercise_pct', '运动完成度 (%)', 'text')}
          {E('mo_exercise_barrier', '运动障碍', 'text')}
          {E('mo_exercise_eval', '运动评估', 'select', '', ['超额完成', '基本完成', '部分完成', '未完成'])}
          {E('mo_diet_regular', '饮食规律性', 'select', '', ['规律', '基本规律', '不规律'])}
          {E('mo_diet_progress', '本月进步点', 'text')}
          {E('mo_diet_challenge', '主要挑战', 'text')}
          {E('mo_supp', '营养素摄入情况', 'text')}
          {E('mo_sleep', '睡眠质量', 'select', '', ['良好', '一般', '较差'])}
          {E('mo_sleep_eval', '睡眠评估', 'textarea')}
          {E('mo_sleep_issue', '睡眠主要问题', 'text')}
          {E('mo_stress_source', '压力来源', 'text')}
          {E('mo_stress_level', '压力水平', 'select', '', ['低', '中', '高', '极高'])}
          {E('mo_smoke_alcohol', '烟酒习惯变化', 'text')}
        </div>
      </Section13>

      <Section13 title="下月健康计划">
        {E('mo_next_goal', '核心目标（1-2个）', 'textarea')}
        {E('mo_next_action', '具体行动方案', 'textarea')}
        {E('mo_next_support', '所需支持', 'text', '如：饮食指导、运动方案、心理支持')}
      </Section13>

      <Section13 title="快速评估">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {E('mo_compliance', '客户配合度', 'select', '', ['高', '中', '低'])}
          {E('mo_risk', '风险等级', 'select', '', ['低风险', '中风险', '高风险'])}
          {E('mo_next_focus', '下次随访重点', 'text')}
          {E('mo_staff', '随访人员', 'text')}
          {E('mo_duration', '随访时长(分钟)', 'text')}
          {E('mo_next_date', '预约下次随访时间', 'text', 'YYYY-MM-DD')}
        </div>
      </Section13>
    </div>
  )
}

// ── 季度随访表单 ────────────────────────────────────────────────
function QuarterlyForm({ extras, setExtra }) {
  const E = (k, label, type='text', placeholder='', options) => (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label className="form-label" style={{ fontSize: 12 }}>{label}</label>
      {type === 'select' ? (
        <select className="form-input" value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)}>
          <option value="">请选择</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea className="form-input" rows={2} placeholder={placeholder} value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)} style={{ resize: 'vertical' }} />
      ) : (
        <input className="form-input" placeholder={placeholder} value={extras[k] || ''} onChange={e => setExtra(k, e.target.value)} />
      )}
    </div>
  )
  const QUARTERLY_CHECKS = ['季度健康趋势总结', '重大健康变化筛查', '年度体检/就医提醒', '服务升级机会评估']
  const selected = (extras.q_checks || '').split(',').filter(Boolean)
  const toggleCheck = v => {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
    setExtra('q_checks', next.join(','))
  }

  return (
    <div>
      <Section13 title="主观健康状况评估">
        {E('q_last_progress', '上期重点问题进展', 'textarea')}
        {E('q_discomfort', '明显不适症状', 'textarea', '如无请填"无"')}
        {E('q_patient_feedback', '客户自主反馈', 'textarea')}
        {E('q_compare', '与前次对比变化', 'textarea')}
      </Section13>

      <Section13 title="量化健康指标">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {E('q_bp', '血压 (mmHg)', 'text', '如：120/80')}
          {E('q_bp_trend', '血压变化趋势', 'select', '', ['改善', '稳定', '恶化'])}
          {E('q_weight', '体重 (kg)', 'text')}
          {E('q_bmi', 'BMI', 'text')}
          {E('q_weight_trend', '体重变化趋势', 'select', '', ['改善', '稳定', '恶化'])}
          {E('q_sleep_hours', '睡眠时长 (小时)', 'text')}
          {E('q_sleep_onset', '入睡困难', 'select', '', ['无', '偶尔', '经常'])}
          {E('q_sleep_interrupt', '睡眠中断', 'select', '', ['无', '偶尔', '经常'])}
          {E('q_sleep_improve', '睡眠改善情况', 'select', '', ['明显改善', '略有改善', '无变化', '有所恶化'])}
          {E('q_bowel_freq', '大便次数/天', 'text')}
          {E('q_bowel_shape', '大便性状', 'select', '', ['正常', '偏稀', '偏干', '不规律'])}
          {E('q_urine', '小便', 'select', '', ['正常', '次数多', '不畅'])}
        </div>
      </Section13>

      <Section13 title="生活方式评估">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {E('q_meal_regular', '三餐规律性', 'select', '', ['规律', '基本规律', '不规律'])}
          {E('q_veg_fruit', '蔬果摄入', 'select', '', ['充足', '一般', '不足'])}
          {E('q_water', '饮水情况', 'text', '每日约 ml')}
          {E('q_diet_special', '特殊饮食关注', 'text')}
          {E('q_supp', '营养素摄入情况', 'text')}
          {E('q_ex_freq', '运动频率', 'text', '如：3次/周')}
          {E('q_ex_type', '运动类型', 'text')}
          {E('q_ex_duration', '每次时长(分钟)', 'text')}
          {E('q_ex_adherence', '运动坚持情况', 'select', '', ['良好', '一般', '较差'])}
          {E('q_ex_barrier', '运动障碍', 'text')}
          {E('q_smoke', '吸烟', 'select', '', ['无', '已戒', '减少', '未变', '增加'])}
          {E('q_alcohol', '饮酒', 'select', '', ['无', '已戒', '减少', '未变', '增加'])}
          {E('q_stress_level', '总体压力水平', 'select', '', ['低', '中', '高', '极高'])}
          {E('q_stress_source', '主要压力源', 'text')}
          {E('q_mood', '情绪状态', 'select', '', ['良好', '一般', '焦虑', '抑郁倾向'])}
        </div>
      </Section13>

      <Section13 title="健康指导与计划调整">
        {E('q_highlight', '本期亮点与进步', 'textarea')}
        {E('q_problems', '主要问题与风险', 'textarea')}
        {E('q_guidance', '具体指导建议', 'textarea')}
        {E('q_next_goal', '下周期健康目标（SMART原则）', 'textarea')}
      </Section13>

      <Section13 title="季度随访重点完成情况">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUARTERLY_CHECKS.map(item => (
            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 6, border: `1px solid ${selected.includes(item) ? '#1E6B50' : '#E0D9CE'}`, background: selected.includes(item) ? '#E8F5EF' : '#fff' }}>
              <input type="checkbox" checked={selected.includes(item)} onChange={() => toggleCheck(item)} style={{ margin: 0 }} />
              {item}
            </label>
          ))}
        </div>
      </Section13>

      <Section13 title="总结与跟进安排">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {E('q_openness', '沟通开放度', 'select', '', ['高', '中', '低'])}
          {E('q_execution', '计划执行力', 'select', '', ['强', '中', '弱'])}
          {E('q_self_mgmt', '自我管理意识', 'select', '', ['强', '中', '弱'])}
          {E('q_risk', '风险等级评估', 'select', '', ['低风险', '中风险', '高风险'])}
          {E('q_referral', '内部转介建议', 'text', '如需要')}
          {E('q_key_focus', '重点关注', 'text')}
          {E('q_prepare', '需准备资料', 'text')}
          {E('q_staff', '随访人员', 'text')}
          {E('q_duration', '随访时长(分钟)', 'text')}
          {E('q_next_date', '下次随访日期', 'text', 'YYYY-MM-DD')}
        </div>
      </Section13>
    </div>
  )
}

function Section13({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1E6B50', background: '#E8F5EF', padding: '4px 10px', borderRadius: '6px 6px 0 0', marginBottom: 0 }}>{title}</div>
      <div style={{ border: '1px solid #E0D9CE', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: 10 }}>{children}</div>
    </div>
  )
}

function ServiceRecordModal({ patients, defaultType, onClose, onSaved }) {
  const [type, setType] = useState(defaultType)
  const [patientId, setPatientId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [diseaseName, setDiseaseName] = useState('')  // 专病名称，仅 disease_mgmt 用于分组
  const [extras, setExtras] = useState({})  // type-specific fields
  const [routinePeriod, setRoutinePeriod] = useState('月度')
  const [routineMethod, setRoutineMethod] = useState('电话')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [aiDrafting, setAiDrafting] = useState(false)  // 场景七：AI生成服务记录草稿

  const setExtra = (k, v) => setExtras(prev => ({ ...prev, [k]: v }))

  const buildContent = () => {
    if (extras.aiContent) return extras.aiContent  // 场景七：AI润色后的正文优先
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
      const lines = [`【${routinePeriod}随访】方式：${routineMethod}`]
      // 把 extras 中所有有值的字段格式化为摘要
      Object.entries(extras).forEach(([k, v]) => {
        if (v && typeof v === 'string') lines.push(`${k}：${v}`)
      })
      return lines.join('\n')
    }
    return extras.content || ''
  }

  // 场景七：用结构化字段生成服务记录正文草稿
  const handleAIDraft = async () => {
    if (!patientId) { setError('请先选择会员'); return }
    const summary = Object.entries(extras)
      .filter(([k, v]) => k !== 'aiContent' && v && typeof v === 'string')
      .map(([k, v]) => `${k}：${v}`).join('；') || '（暂无结构化记录，请先填写字段）'
    setAiDrafting(true); setError('')
    try {
      const r = await staffAPI.generateAIDraft(patientId, 'service_record', {
        serviceType: TYPE_LABEL[type], title, summary,
      })
      setExtra('aiContent', r.data.draft)
    } catch (err) { setError(err.message || 'AI生成失败') }
    finally { setAiDrafting(false) }
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
        diseaseName: type === 'disease_mgmt' ? diseaseName : '',
        medicalEscort: { hospital: extras.hospital || '', department: extras.department || '', doctor: extras.doctor || '' },
      })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const renderFields = () => {
    if (type === 'disease_mgmt') return (
      <>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label className="form-label" style={{ fontSize: 12 }}>专病名称 <span style={{ color: '#8AA89C', fontWeight: 400 }}>（用于按专病分组展示，如"巧克力囊肿""肺结节"）</span></label>
          <input className="form-input" placeholder="如：巧克力囊肿" value={diseaseName} onChange={e => setDiseaseName(e.target.value)} />
        </div>
        {DISEASE_MGMT_FIELDS.map(f => (
          <div key={f.key} className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
            {f.type === 'textarea'
              ? <textarea className="form-input" rows={2} value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} style={{ resize: 'vertical' }} />
              : <input className="form-input" value={extras[f.key] || ''} onChange={e => setExtra(f.key, e.target.value)} />}
          </div>
        ))}
      </>
    )
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12 }}>随访周期 *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ROUTINE_PERIODS.map(p => (
                <button key={p} type="button" onClick={() => { setRoutinePeriod(p); setExtras({}) }}
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
        {routinePeriod === '双周' && <BiWeeklyForm extras={extras} setExtra={setExtra} />}
        {routinePeriod === '月度' && <MonthlyForm extras={extras} setExtra={setExtra} />}
        {routinePeriod === '季度' && <QuarterlyForm extras={extras} setExtra={setExtra} />}
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
              <PatientSearchInput value={patientId} onChange={setPatientId} />
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

          {/* 场景七：AI生成记录正文草稿 */}
          <div style={{ borderTop: '1px solid #E0D9CE', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E6B50' }}>AI记录正文（可选）</div>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '2px 10px' }}
                onClick={handleAIDraft} disabled={aiDrafting}>
                {aiDrafting ? '生成中...' : '✨ AI生成草稿'}
              </button>
            </div>
            <textarea className="form-input" rows={4}
              placeholder="点击右上角「AI生成草稿」，将上方结构化字段润色为规范的服务记录正文；填写后将作为记录内容保存（留空则用结构化字段拼接）。"
              value={extras.aiContent || ''}
              onChange={e => setExtra('aiContent', e.target.value)} style={{ resize: 'vertical' }} />
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
