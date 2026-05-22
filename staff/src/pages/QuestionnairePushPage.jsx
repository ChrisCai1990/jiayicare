import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

export default function QuestionnairePushPage() {
  const toast = useToast()
  const [questionnaires, setQuestionnaires] = useState([])
  const [pushRecords, setPushRecords] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [pushModal, setPushModal] = useState(null)

  useEffect(() => {
    Promise.all([
      staffAPI.getQuestionnaires(),
      staffAPI.getPushRecords({ type: 'questionnaire', limit: 30 }),
      staffAPI.getPatients({ limit: 200 }),
    ]).then(([q, pr, pt]) => {
      setQuestionnaires(q.data)
      setPushRecords(pr.data.records)
      setPatients(pt.data.patients)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const reload = async () => {
    const pr = await staffAPI.getPushRecords({ type: 'questionnaire', limit: 30 })
    setPushRecords(pr.data.records)
  }

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">问卷推送</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 问卷库 */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📝 问卷模板库</div>
          {questionnaires.length === 0 ? (
            <div className="card" style={{ padding: 30, textAlign: 'center', color: '#aaa' }}>暂无可用问卷（请在管理后台创建）</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {questionnaires.map(q => (
                <div key={q._id} className="card">
                  <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{q.title}</div>
                      {q.description && <div style={{ fontSize: 13, color: '#8AA89C' }}>{q.description}</div>}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setPushModal(q)}>📤 推送</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 推送记录 */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📋 最近推送记录</div>
          {pushRecords.length === 0 ? (
            <div className="card" style={{ padding: 30, textAlign: 'center', color: '#aaa' }}>暂无推送记录</div>
          ) : (
            <div className="card">
              {pushRecords.map((r, i) => (
                <div key={r._id} style={{ padding: '12px 16px', borderBottom: i < pushRecords.length - 1 ? '1px solid #f5f2ec' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: '#8AA89C' }}>{r.patientId?.name} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}</div>
                  </div>
                  {r.readAt ? <span style={{ fontSize: 11, color: '#22A06B' }}>✓ 已读</span> : <span style={{ fontSize: 11, color: '#D97706' }}>未读</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pushModal && (
        <PushQuestionnaireModal
          questionnaire={pushModal}
          patients={patients}
          onClose={() => setPushModal(null)}
          onSaved={async (n) => { setPushModal(null); toast(`问卷已推送给 ${n} 位会员`); await reload() }}
        />
      )}
    </div>
  )
}

function PushQuestionnaireModal({ questionnaire, patients, onClose, onSaved }) {
  const [selected, setSelected] = useState([])
  const [deadline, setDeadline] = useState('')
  const [pushing, setPushing] = useState(false)
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const handlePush = async () => {
    if (!selected.length) return
    setPushing(true)
    try { await staffAPI.pushQuestionnaire(questionnaire._id, { patientIds: selected, deadline }); onSaved(selected.length) }
    catch { onSaved(selected.length) }
    finally { setPushing(false) }
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(patients.map(p => p._id))}>全选</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>清空</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {patients.map(p => (
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
          <button className="btn btn-primary" onClick={handlePush} disabled={!selected.length || pushing}>{pushing ? '推送中...' : `推送给 ${selected.length} 人`}</button>
        </div>
      </div>
    </div>
  )
}
