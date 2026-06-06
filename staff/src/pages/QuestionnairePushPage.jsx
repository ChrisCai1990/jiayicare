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

const Q_TYPE_LABEL = {
  radio: '单选题', multi: '多选题', dropdown: '下拉选择', scale: '量表题',
  matrix: '矩阵题', text: '文本输入', number: '数字输入', date: '日期输入',
}

// ── 问卷详情预览弹窗 ────────────────────────────────────────
function PreviewModal({ questionnaire, onClose }) {
  const meta = STATUS_META[questionnaire.status] || STATUS_META.draft
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">📋 问卷详情预览</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {/* 基本信息 */}
          <div style={{ background: '#f9f7f3', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: '#1A2B24' }}>{questionnaire.title}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: meta.bg, color: meta.color, fontWeight: 600, flexShrink: 0 }}>
                {meta.label}
              </span>
            </div>
            {questionnaire.description && (
              <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 8, lineHeight: 1.6 }}>{questionnaire.description}</div>
            )}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#8AA89C' }}>
              <span>共 {questionnaire.questions?.length || 0} 道题</span>
              {questionnaire.deadline && <span>截止日期：{questionnaire.deadline}</span>}
            </div>
          </div>

          {/* 题目列表 */}
          {(questionnaire.questions || []).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#aaa', padding: 32 }}>该问卷暂无题目</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {questionnaire.questions.map((q, i) => (
                <div key={q.id || i} style={{ border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
                  {/* 题目头 */}
                  <div style={{ background: '#f5f0e8', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: '#1E6B50', color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>Q{i + 1}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C', background: '#fff', border: '1px solid #E0D9CE', borderRadius: 4, padding: '1px 6px' }}>
                      {Q_TYPE_LABEL[q.type] || q.type}
                    </span>
                    {q.required === false && (
                      <span style={{ fontSize: 11, color: '#8AA89C' }}>（选填）</span>
                    )}
                  </div>
                  {/* 题目内容 */}
                  <div style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B24', marginBottom: 10 }}>
                      {q.text}
                      {q.required !== false && <span style={{ color: '#DC3545', marginLeft: 4 }}>*</span>}
                    </div>

                    {/* 单选/多选/下拉：展示选项 */}
                    {(q.type === 'radio' || q.type === 'multi' || q.type === 'dropdown') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4A6558' }}>
                            <div style={{ width: 16, height: 16, borderRadius: q.type === 'radio' ? '50%' : 3, border: '1.5px solid #CBD5CE', flexShrink: 0 }} />
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 量表 */}
                    {q.type === 'scale' && (
                      <div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          {Array.from({ length: (q.max || 10) - (q.min || 1) + 1 }, (_, k) => k + (q.min || 1)).map(n => (
                            <div key={n} style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #CBD5CE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#4A6558' }}>{n}</div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8AA89C' }}>
                          <span>{q.minLabel || ''}</span>
                          <span>{q.maxLabel || ''}</span>
                        </div>
                      </div>
                    )}

                    {/* 矩阵 */}
                    {q.type === 'matrix' && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 300 }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '4px 10px', textAlign: 'left', color: '#8AA89C', fontWeight: 400, borderBottom: '1px solid #E0D9CE' }}></th>
                              {(q.cols || []).map((col, ci) => (
                                <th key={ci} style={{ padding: '4px 10px', color: '#4A6558', fontWeight: 600, borderBottom: '1px solid #E0D9CE', textAlign: 'center' }}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(q.rows || []).map((row, ri) => (
                              <tr key={ri}>
                                <td style={{ padding: '6px 10px', color: '#4A6558', borderBottom: '1px solid #f0ede7' }}>{row}</td>
                                {(q.cols || []).map((_, ci) => (
                                  <td key={ci} style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid #f0ede7' }}>
                                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #CBD5CE', margin: '0 auto' }} />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* 数字输入 */}
                    {q.type === 'number' && (
                      <div style={{ fontSize: 12, color: '#8AA89C' }}>
                        数字输入框
                        {(q.min !== undefined || q.max !== undefined) && (
                          <span>（范围：{q.min ?? '不限'} ~ {q.max ?? '不限'}）</span>
                        )}
                        {q.placeholder && <span>，提示：{q.placeholder}</span>}
                      </div>
                    )}

                    {/* 文本/日期 */}
                    {(q.type === 'text' || q.type === 'date') && q.placeholder && (
                      <div style={{ fontSize: 12, color: '#8AA89C' }}>提示：{q.placeholder}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// ── 查看回答弹窗（支持全部 / 指定患者）────────────────────────────
function ResponsesModal({ questionnaire, filterPatientId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    staffAPI.getQuestionnaireResponses(questionnaire._id)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [questionnaire._id])

  const q = data?.questionnaire
  const allResponses = data?.responses || []
  const responses = filterPatientId
    ? allResponses.filter(r => String(r.user?._id) === String(filterPatientId))
    : allResponses

  // 导出为 CSV
  const exportCSV = () => {
    if (!q || responses.length === 0) return
    const headers = ['会员姓名', '手机号', '提交时间', ...(q.questions || []).map((qn, i) => `Q${i+1}.${qn.text}`)]
    const rows = responses.map(resp => [
      resp.user?.name || '匿名',
      resp.user?.phone || '-',
      resp.submittedAt ? new Date(resp.submittedAt).toLocaleString('zh-CN') : '-',
      ...(q.questions || []).map(qn => fmtAnswer(resp.answers?.[qn.id])),
    ])
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${questionnaire.title}_答卷.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">📊 答卷详情 · {questionnaire.title}{filterPatientId ? ' · 指定会员' : ''}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ textAlign: 'center', padding: 32, color: '#aaa' }}>加载中...</div>}
          {!loading && responses.length === 0 && (
            <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>
              {filterPatientId ? '该会员尚未提交答卷' : '暂无会员提交答卷'}
            </div>
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
          {!loading && responses.length > 0 && (
            <button className="btn btn-secondary" onClick={exportCSV}>⬇ 导出 CSV</button>
          )}
          <button className="btn btn-primary" onClick={onClose}>关闭</button>
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
  const [viewModal, setViewModal] = useState(null)   // { questionnaire, filterPatientId? }
  const [previewModal, setPreviewModal] = useState(null)
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
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setPreviewModal(q)}>🔍 查看详情</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewModal({ ...q, filterPatientId: null })}>📊 查看回答</button>
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
                  <th>操作</th>
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
                    <td>
                      {r.questionnaireId && (
                        <button className="btn btn-secondary btn-sm"
                          onClick={() => setViewModal({ _id: r.questionnaireId, title: r.title, filterPatientId: r.patientId?._id })}>
                          查看答案
                        </button>
                      )}
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

      {/* 问卷详情预览弹窗 */}
      {previewModal && (
        <PreviewModal
          questionnaire={previewModal}
          onClose={() => setPreviewModal(null)}
        />
      )}

      {/* 查看回答弹窗 */}
      {viewModal && (
        <ResponsesModal
          questionnaire={viewModal}
          filterPatientId={viewModal.filterPatientId}
          onClose={() => setViewModal(null)}
        />
      )}
    </div>
  )
}
