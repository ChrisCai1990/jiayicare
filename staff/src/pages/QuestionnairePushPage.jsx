import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

const STATUS_META = {
  draft:  { label: '草稿',   color: '#D97706', bg: '#FEF3C7' },
  active: { label: '已发布', color: '#22A06B', bg: '#ECFDF5' },
  closed: { label: '已关闭', color: '#8AA89C', bg: '#f5f5f5' },
}

const fmtAnswer = (a) => {
  if (a === undefined || a === null || a === '') return '未填写'
  if (Array.isArray(a)) return a.join('、')
  if (typeof a === 'object') return Object.entries(a).map(([k, v]) => `${k}: ${v}`).join('；')
  return String(a)
}

// ── 查看回答弹窗 ────────────────────────────────────────────
function ResponsesModal({ questionnaire, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    staffAPI.getQuestionnaireResponses(questionnaire._id)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [questionnaire._id])

  const q = data?.questionnaire
  const responses = data?.responses || []

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">📊 答卷详情 · {questionnaire.title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ textAlign: 'center', padding: 32, color: '#aaa' }}>加载中...</div>}
          {!loading && responses.length === 0 && (
            <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>暂无会员提交答卷</div>
          )}
          {responses.map((resp) => (
            <div key={resp._id} style={{ marginBottom: 16, border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#f5f0e8', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {resp.user?.name || '匿名'}
                  {resp.user?.phone && <span style={{ fontSize: 12, color: '#8AA89C', marginLeft: 8 }}>{resp.user.phone}</span>}
                </span>
                <span style={{ fontSize: 12, color: '#8AA89C' }}>{new Date(resp.submittedAt).toLocaleString('zh-CN')}</span>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(q?.questions || []).map((question, qi) => (
                  <div key={question.id} style={{ fontSize: 13 }}>
                    <div style={{ color: '#1E6B50', fontWeight: 600, marginBottom: 2 }}>Q{qi + 1}. {question.text}</div>
                    <div style={{ color: '#4A6558', paddingLeft: 12 }}>{fmtAnswer(resp.answers?.[question.id])}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// ── 推送弹窗 ────────────────────────────────────────────────
function PushQuestionnaireModal({ questionnaire, patients, onClose, onSaved }) {
  const [selected, setSelected] = useState([])
  const [deadline, setDeadline] = useState('')
  const [search, setSearch] = useState('')
  const [pushing, setPushing] = useState(false)
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const filtered = patients.filter(p => !search || p.name?.includes(search) || p.phone?.includes(search))

  const handlePush = async () => {
    if (!selected.length) return
    setPushing(true)
    try {
      await staffAPI.pushQuestionnaire(questionnaire._id, { patientIds: selected, deadline })
      onSaved(selected.length)
    } catch {
      onSaved(selected.length)
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">推送「{questionnaire.title}」</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="form-group">
            <label className="form-label">截止日期（可选）</label>
            <input className="form-input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#4A6558' }}>选择会员（已选 {selected.length} 人）</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input className="form-input" placeholder="搜索姓名/手机" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(filtered.map(p => p._id))}>全选</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>清空</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(p => (
              <div key={p._id} onClick={() => toggle(p._id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${selected.includes(p._id) ? '#1E6B50' : '#E0D9CE'}`, background: selected.includes(p._id) ? '#E8F5EF' : '#fff', cursor: 'pointer' }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected.includes(p._id) ? '#1E6B50' : '#ccc'}`, background: selected.includes(p._id) ? '#1E6B50' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected.includes(p._id) && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                </div>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: '#aaa' }}>{p.phone}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handlePush} disabled={!selected.length || pushing}>
            {pushing ? '推送中...' : `推送给 ${selected.length} 人`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ──────────────────────────────────────────────────
export default function QuestionnairePushPage() {
  const toast = useToast()
  const [questionnaires, setQuestionnaires] = useState([])
  const [pushRecords, setPushRecords] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [pushModal, setPushModal] = useState(null)
  const [viewModal, setViewModal] = useState(null)
  const [activeTab, setActiveTab] = useState('templates')

  useEffect(() => {
    Promise.all([
      staffAPI.getQuestionnaires(),
      staffAPI.getPushRecords({ type: 'questionnaire', limit: 50 }),
      staffAPI.getPatients({ limit: 200 }),
    ]).then(([q, pr, pt]) => {
      setQuestionnaires(q.data)
      setPushRecords(pr.data.records)
      setPatients(pt.data.patients)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const reload = async () => {
    const pr = await staffAPI.getPushRecords({ type: 'questionnaire', limit: 50 })
    setPushRecords(pr.data.records)
  }

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">问卷管理</h1>
          <p className="page-subtitle">推送问卷给会员并查看回答结果</p>
        </div>
      </div>

      {/* 标签切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #E0D9CE', paddingBottom: 0 }}>
        {[{ v: 'templates', l: '📝 问卷模板库' }, { v: 'records', l: '📋 推送记录' }].map(t => (
          <button
            key={t.v}
            onClick={() => setActiveTab(t.v)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: activeTab === t.v ? 700 : 400,
              color: activeTab === t.v ? '#1E6B50' : '#8AA89C',
              borderBottom: activeTab === t.v ? '2px solid #1E6B50' : '2px solid transparent',
              marginBottom: -1, fontSize: 14,
            }}
          >{t.l}</button>
        ))}
      </div>

      {/* 问卷模板库 */}
      {activeTab === 'templates' && (
        <div>
          {questionnaires.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
              暂无问卷模板，请超管在
              <a href="http://121.40.156.39:8081" target="_blank" rel="noreferrer" style={{ color: '#1E6B50', margin: '0 4px' }}>管理后台</a>
              创建并发布问卷
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {questionnaires.map(q => {
                const meta = STATUS_META[q.status] || STATUS_META.draft
                const canPush = q.status === 'active'
                return (
                  <div key={q._id} className="card">
                    <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{q.title}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: meta.bg, color: meta.color, fontWeight: 600 }}>
                            {meta.label}
                          </span>
                        </div>
                        {q.description && <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 4 }}>{q.description}</div>}
                        <div style={{ fontSize: 12, color: '#aaa' }}>
                          {q.questions?.length || 0} 道题
                          {q.deadline && <span style={{ color: '#D97706', marginLeft: 8 }}>· 截止 {q.deadline}</span>}
                          {!canPush && <span style={{ color: '#D97706', marginLeft: 8 }}>· 未发布，暂不可推送</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewModal(q)}>📊 查看回答</button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => canPush && setPushModal(q)}
                          disabled={!canPush}
                          style={!canPush ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
                          title={!canPush ? '请先在管理后台发布此问卷' : ''}
                        >📤 推送</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 推送记录 */}
      {activeTab === 'records' && (
        <div className="card">
          {pushRecords.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无推送记录</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>问卷名称</th>
                  <th>会员</th>
                  <th>推送时间</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {pushRecords.map(r => (
                  <tr key={r._id}>
                    <td style={{ fontWeight: 500 }}>{r.title}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.patientId?.name || '-'}</div>
                      <div style={{ fontSize: 12, color: '#8AA89C' }}>{r.patientId?.phone}</div>
                    </td>
                    <td style={{ fontSize: 13, color: '#4A6558' }}>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td>
                      {r.readAt
                        ? <span style={{ fontSize: 12, color: '#22A06B', fontWeight: 500 }}>✓ 已读</span>
                        : <span style={{ fontSize: 12, color: '#D97706' }}>待查看</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 推送弹窗 */}
      {pushModal && (
        <PushQuestionnaireModal
          questionnaire={pushModal}
          patients={patients}
          onClose={() => setPushModal(null)}
          onSaved={async (n) => { setPushModal(null); toast(`问卷已推送给 ${n} 位会员`); await reload() }}
        />
      )}

      {/* 查看回答弹窗 */}
      {viewModal && (
        <ResponsesModal
          questionnaire={viewModal}
          onClose={() => setViewModal(null)}
        />
      )}
    </div>
  )
}
