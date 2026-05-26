import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const STATUS_META = {
  draft:  { label: '草稿',   cls: 'badge-gray'   },
  active: { label: '发布中', cls: 'badge-green'  },
  closed: { label: '已关闭', cls: 'badge-yellow'  },
}

const Q_TYPE_LABELS = {
  radio: '单选', multi: '多选', scale: '量表', matrix: '矩阵', text: '文本', number: '数字', date: '日期',
}

// ── 问题编辑器 ────────────────────────────────────────────────────
function QuestionEditor({ questions, onChange }) {
  const addQ = () => onChange([...questions, { id: `q${Date.now()}`, type: 'radio', text: '', options: ['选项1', '选项2'], required: true, placeholder: '' }])
  const updateQ = (i, upd) => { const q = [...questions]; q[i] = { ...q[i], ...upd }; onChange(q) }
  const removeQ = (i) => { const q = [...questions]; q.splice(i, 1); onChange(q) }
  const moveQ   = (i, dir) => {
    const q = [...questions]
    const j = i + dir
    if (j < 0 || j >= q.length) return
    ;[q[i], q[j]] = [q[j], q[i]]
    onChange(q)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {questions.map((q, i) => (
        <div key={q.id} style={{ border: '1px solid #E0D9CE', borderRadius: 8, padding: 12, background: '#fafaf8' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: '#1E6B50', minWidth: 24 }}>Q{i + 1}</span>
            <select value={q.type} onChange={e => {
              const type = e.target.value
              const upd = { type }
              if (type === 'radio' || type === 'multi') upd.options = q.options || ['选项1', '选项2']
              if (type === 'scale') { upd.min = 1; upd.max = 10; upd.minLabel = '非常差'; upd.maxLabel = '非常好' }
              if (type === 'matrix') { upd.rows = ['项目1']; upd.cols = ['无', '轻度', '中度', '重度'] }
              if (type === 'number') { upd.min = undefined; upd.max = undefined; upd.placeholder = '请输入数字' }
              if (type === 'date') { upd.placeholder = '请选择日期' }
              updateQ(i, upd)
            }} style={{ border: '1px solid #ccc', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}>
              {Object.entries(Q_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={q.required !== false} onChange={e => updateQ(i, { required: e.target.checked })} />必填
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => moveQ(i, -1)} disabled={i === 0}>↑</button>
              <button className="btn btn-sm btn-ghost" onClick={() => moveQ(i, 1)} disabled={i === questions.length - 1}>↓</button>
              <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => removeQ(i)}>删</button>
            </div>
          </div>

          <input className="form-input" placeholder="问题内容" value={q.text} onChange={e => updateQ(i, { text: e.target.value })} style={{ marginBottom: 8 }} />

          {/* radio / multi: options */}
          {(q.type === 'radio' || q.type === 'multi') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(q.options || []).map((opt, oi) => (
                <div key={oi} style={{ display: 'flex', gap: 4 }}>
                  <input className="form-input" value={opt} style={{ flex: 1 }}
                    onChange={e => { const opts = [...q.options]; opts[oi] = e.target.value; updateQ(i, { options: opts }) }} />
                  <button className="btn btn-sm btn-ghost" onClick={() => {
                    const opts = q.options.filter((_, idx) => idx !== oi); updateQ(i, { options: opts })
                  }}>×</button>
                </div>
              ))}
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }}
                onClick={() => updateQ(i, { options: [...(q.options || []), `选项${(q.options || []).length + 1}`] })}>
                ＋ 添加选项
              </button>
            </div>
          )}

          {/* scale */}
          {q.type === 'scale' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}>最小值</span>
                <input type="number" className="form-input" style={{ width: 60 }} value={q.min || 1} onChange={e => updateQ(i, { min: parseInt(e.target.value) })} />
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}>最大值</span>
                <input type="number" className="form-input" style={{ width: 60 }} value={q.max || 10} onChange={e => updateQ(i, { max: parseInt(e.target.value) })} />
              </div>
              <input className="form-input" style={{ flex: 1 }} placeholder="最小标签（如：非常差）" value={q.minLabel || ''} onChange={e => updateQ(i, { minLabel: e.target.value })} />
              <input className="form-input" style={{ flex: 1 }} placeholder="最大标签（如：非常好）" value={q.maxLabel || ''} onChange={e => updateQ(i, { maxLabel: e.target.value })} />
            </div>
          )}

          {/* matrix */}
          {q.type === 'matrix' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>行（每行一个）</div>
                <textarea className="form-input" rows={3} value={(q.rows || []).join('\n')}
                  onChange={e => updateQ(i, { rows: e.target.value.split('\n') })} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>列（每行一个）</div>
                <textarea className="form-input" rows={3} value={(q.cols || []).join('\n')}
                  onChange={e => updateQ(i, { cols: e.target.value.split('\n') })} />
              </div>
            </div>
          )}

          {/* text */}
          {q.type === 'text' && (
            <input className="form-input" placeholder="占位提示文字（可选）" value={q.placeholder || ''}
              onChange={e => updateQ(i, { placeholder: e.target.value })} />
          )}

          {/* number */}
          {q.type === 'number' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}>最小值（可选）</span>
                <input type="number" className="form-input" style={{ width: 80 }} value={q.min ?? ''} onChange={e => updateQ(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}>最大值（可选）</span>
                <input type="number" className="form-input" style={{ width: 80 }} value={q.max ?? ''} onChange={e => updateQ(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <input className="form-input" style={{ flex: 1 }} placeholder="占位提示（如：请输入您的体重kg）" value={q.placeholder || ''}
                onChange={e => updateQ(i, { placeholder: e.target.value })} />
            </div>
          )}

          {/* date */}
          {q.type === 'date' && (
            <input className="form-input" placeholder="占位提示（如：请选择检查日期）" value={q.placeholder || ''}
              onChange={e => updateQ(i, { placeholder: e.target.value })} />
          )}
        </div>
      ))}
      <button className="btn btn-ghost" onClick={addQ} style={{ alignSelf: 'flex-start' }}>＋ 添加问题</button>
    </div>
  )
}

// ── 问卷编辑弹窗 ──────────────────────────────────────────────────
function QuestionnaireModal({ questionnaire, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!questionnaire?._id
  const [form, setForm] = useState({
    title: questionnaire?.title || '',
    description: questionnaire?.description || '',
    questions: questionnaire?.questions || [],
    targetType: questionnaire?.targetType || 'all',
    deadline: questionnaire?.deadline || '',
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) { toast('❌ 请输入问卷标题'); return }
    if (form.questions.length === 0) { toast('❌ 至少添加一个问题'); return }
    setLoading(true)
    try {
      if (isEdit) {
        await adminAPI.updateQuestionnaire(questionnaire._id, form)
      } else {
        await adminAPI.createQuestionnaire(form)
      }
      toast(`✅ 问卷${isEdit ? '更新' : '创建'}成功`)
      onSaved()
      onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, width: '96%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑问卷' : '📝 新建问卷'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">问卷标题 *</label>
            <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="如：高血压患者生活质量调查" />
          </div>
          <div className="form-group">
            <label className="form-label">问卷说明</label>
            <textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="请在此填写说明..." />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">推送对象</label>
              <select className="form-input" value={form.targetType} onChange={e => set('targetType', e.target.value)}>
                <option value="all">全体用户</option>
                <option value="specific">指定用户</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">截止日期（可选）</label>
              <input type="date" className="form-input" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">问题列表</label>
            <QuestionEditor questions={form.questions} onChange={qs => set('questions', qs)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>
            {loading ? '保存中...' : '保存问卷'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 答卷查看弹窗 ──────────────────────────────────────────────────
function ResponsesModal({ questionnaire, onClose }) {
  const toast = useToast()
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.questionnaireResponses(questionnaire._id)
      .then(r => setResponses(r.data || []))
      .catch(err => toast('❌ ' + err.message))
      .finally(() => setLoading(false))
  }, [questionnaire._id])

  const fmtAnswer = (a) => {
    if (!a && a !== 0) return '未填写'
    if (Array.isArray(a)) return a.join('、')
    if (typeof a === 'object') return Object.entries(a).map(([k, v]) => `${k}: ${v}`).join('；')
    return String(a)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 800, width: '96%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">📊 答卷详情 · {questionnaire.title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading && <div style={{ textAlign: 'center', padding: 32 }}>加载中...</div>}
          {!loading && responses.length === 0 && (
            <div style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无答卷</div>
          )}
          {responses.map((resp, ri) => (
            <div key={resp._id} style={{ marginBottom: 20, border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#f5f0e8', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{resp.user?.name || '匿名'} · {resp.user?.phone}</span>
                <span style={{ fontSize: 12, color: '#888' }}>{new Date(resp.submittedAt).toLocaleString('zh-CN')}</span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questionnaire.questions?.map((q, qi) => (
                  <div key={q.id} style={{ fontSize: 13 }}>
                    <span style={{ color: '#1E6B50', fontWeight: 600 }}>Q{qi + 1}. {q.text}</span>
                    <div style={{ color: '#444', marginTop: 2, paddingLeft: 12 }}>{fmtAnswer(resp.answers?.[q.id])}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function QuestionnairePage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewingResponses, setViewingResponses] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.questionnaires()
      setList(res.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const setStatus = async (q, status) => {
    try {
      await adminAPI.setQuestionnaireStatus(q._id, status)
      toast('✅ 状态已更新')
      load()
    } catch (err) {
      toast('❌ ' + err.message)
    }
  }

  const del = async (q) => {
    if (!window.confirm(`确定删除「${q.title}」及所有答卷？此操作不可恢复。`)) return
    try {
      await adminAPI.deleteQuestionnaire(q._id)
      toast('✅ 已删除')
      load()
    } catch (err) {
      toast('❌ ' + err.message)
    }
  }

  const openEdit = (q) => { setEditing(q); setShowModal(true) }
  const openNew  = ()  => { setEditing(null); setShowModal(true) }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📝 问卷管理</div>
          <div className="page-subtitle">创建并管理向用户推送的健康问卷</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>＋ 新建问卷</button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>问卷标题</th>
                <th>问题数</th>
                <th>推送对象</th>
                <th>截止日期</th>
                <th>回答人数</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无问卷，点击「新建问卷」开始创建</td></tr>
              )}
              {list.map(q => {
                const meta = STATUS_META[q.status] || STATUS_META.draft
                return (
                  <tr key={q._id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{q.title}</div>
                      {q.description && <div style={{ fontSize: 12, color: '#888' }}>{q.description.slice(0, 40)}{q.description.length > 40 ? '...' : ''}</div>}
                    </td>
                    <td>{q.questions?.length || 0} 题</td>
                    <td>{q.targetType === 'all' ? '全体用户' : `指定 ${q.targetUsers?.length || 0} 人`}</td>
                    <td>{q.deadline || '—'}</td>
                    <td>
                      <span style={{ cursor: 'pointer', color: '#1E6B50', textDecoration: 'underline' }}
                        onClick={() => setViewingResponses(q)}>
                        {q.responseCount || 0} 份
                      </span>
                    </td>
                    <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                    <td style={{ fontSize: 12, color: '#888' }}>{new Date(q.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(q)}>编辑</button>
                        {q.status === 'draft'  && <button className="btn btn-sm btn-ghost" style={{ color: '#1E6B50' }} onClick={() => setStatus(q, 'active')}>发布</button>}
                        {q.status === 'active' && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(q, 'closed')}>关闭</button>}
                        {q.status === 'closed' && <button className="btn btn-sm btn-ghost" style={{ color: '#1E6B50' }} onClick={() => setStatus(q, 'active')}>重开</button>}
                        <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => del(q)}>删除</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <QuestionnaireModal
          questionnaire={editing}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}

      {viewingResponses && (
        <ResponsesModal
          questionnaire={viewingResponses}
          onClose={() => setViewingResponses(null)}
        />
      )}
    </div>
  )
}
