import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'
import { useAdmin, useToast } from '../App'

const VITAL_META = {
  bloodPressure: { label: '血压',   unit: 'mmHg', fmt: r => r.extra?.sys ? `${r.extra.sys}/${r.extra.dia}` : r.value },
  bloodSugar:    { label: '血糖',   unit: 'mmol/L', fmt: r => r.value },
  heartRate:     { label: '心率',   unit: 'bpm', fmt: r => r.value },
  weight:        { label: '体重',   unit: 'kg', fmt: r => r.value },
  sleep:         { label: '睡眠',   unit: 'h', fmt: r => r.value },
}

const STATUS_META = {
  pending:   { label: '待联系', badge: 'badge-yellow' },
  scheduled: { label: '已安排', badge: 'badge-blue' },
  completed: { label: '已完成', badge: 'badge-green' },
  cancelled: { label: '已取消', badge: 'badge-gray' },
}

const TASK_CAT = {
  followup: '随访', medication: '用药', exercise: '运动', diet: '饮食',
  checkup: '复查', lifestyle: '生活', other: '其他',
}

function SendMessageModal({ userId, onClose, onSent }) {
  const { admin } = useAdmin()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  const send = async () => {
    if (!content.trim()) return
    setLoading(true)
    try {
      await adminAPI.sendMessage(userId, title || `来自${admin?.name}的消息`, content)
      toast('✅ 消息已发送')
      onSent()
      onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '发送失败'))
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">💬 发送消息给会员</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">消息标题（可选）</label>
            <input className="form-input" placeholder="如：复诊提醒、用药指导..." value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">消息内容 *</label>
            <textarea className="form-input" placeholder="请输入消息内容..." value={content} onChange={e => setContent(e.target.value)} rows={5} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={send} disabled={loading || !content.trim()}>
            {loading ? '发送中...' : '发送消息'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateTaskModal({ userId, onClose, onCreated }) {
  const toast = useToast()
  const [form, setForm] = useState({ title: '', category: 'followup', description: '', priority: 2 })
  const [loading, setLoading] = useState(false)

  const create = async () => {
    if (!form.title.trim()) return
    setLoading(true)
    try {
      await adminAPI.createTask(userId, form)
      toast('✅ 任务已创建')
      onCreated()
      onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '创建失败'))
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">✅ 创建任务</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">任务标题 *</label>
            <input className="form-input" placeholder="如：今日测量血压并记录" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">任务分类</label>
              <select className="form-input filter-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {Object.entries(TASK_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">优先级</label>
              <select className="form-input filter-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) }))}>
                <option value={1}>🔴 高</option>
                <option value={2}>🟡 中</option>
                <option value={3}>🟢 低</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">补充说明（可选）</label>
            <textarea className="form-input" placeholder="任务详细说明..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={create} disabled={loading || !form.title.trim()}>
            {loading ? '创建中...' : '创建任务'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PatientDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [showMsg, setShowMsg] = useState(false)
  const [showTask, setShowTask] = useState(false)

  // 复查计划状态
  const [checkupPlan, setCheckupPlan] = useState(null)
  const [checkupLoaded, setCheckupLoaded] = useState(false)
  const [checkupItems, setCheckupItems] = useState([]) // 编辑中的 items
  const [checkupTitle, setCheckupTitle] = useState('')
  const [checkupNote, setCheckupNote] = useState('')
  const [savingCheckup, setSavingCheckup] = useState(false)

  const load = async () => {
    setLoading(true)
    try { const res = await adminAPI.patientDetail(id); setData(res.data) }
    catch (err) { toast('❌ ' + err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  // 切换到复查计划 tab 时加载
  useEffect(() => {
    if (tab !== 'checkup' || checkupLoaded) return
    adminAPI.getCheckupPlan(id).then(res => {
      const plan = res.data
      setCheckupPlan(plan)
      setCheckupItems(plan?.items ? plan.items.map(it => ({ ...it, _local: it._id })) : [])
      setCheckupTitle(plan?.title || `${new Date().getFullYear()}年度复查计划`)
      setCheckupNote(plan?.note || '')
      setCheckupLoaded(true)
    }).catch(err => toast('❌ ' + err.message))
  }, [tab, id, checkupLoaded])

  if (loading) return <div className="loading-wrap"><div className="spinner" /> 加载会员数据...</div>
  if (!data) return <div className="empty-state"><div className="empty-state-icon">😕</div><div>会员数据加载失败</div></div>

  const { user, latestVitals, records, tasks, messages, orders } = data
  const score = user.healthScore
  const scoreClass = score >= 80 ? 'score-good' : score >= 60 ? 'score-ok' : 'score-bad'

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('zh-CN') : '--'
  const fmtTime = (d) => d ? new Date(d).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'

  return (
    <>
      {/* Back */}
      <button className="back-link" onClick={() => nav('/patients')}>← 返回会员列表</button>

      {/* Patient header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
              {(user.name || '用')[0]}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{user.name || '未填写姓名'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 3 }}>
                {[user.phone, user.age && `${user.age}岁`, user.gender !== '未知' && user.gender].filter(Boolean).join(' · ')}
              </div>
              <div style={{ marginTop: 6 }}>
                {user.servicePackage
                  ? <span className="badge badge-green" style={{ fontSize: 12 }}>{user.servicePackage} · 到期 {user.serviceExpiry}</span>
                  : <span className="badge badge-gray" style={{ fontSize: 12 }}>未开通服务包</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div className={`score-ring ${scoreClass}`} style={{ width: 52, height: 52, fontSize: 18 }}>{score || '--'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>健康评分</div>
            </div>
            <button className="btn btn-outline" onClick={() => setShowMsg(true)}>💬 发消息</button>
            <button className="btn btn-primary" onClick={() => setShowTask(true)}>✅ 创建任务</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { key: 'overview', label: '📊 概览' },
          { key: 'records',  label: `📈 健康记录 (${records.length})` },
          { key: 'tasks',    label: `✅ 任务 (${tasks.length})` },
          { key: 'messages', label: `💬 消息 (${messages.length})` },
          { key: 'orders',   label: `📋 订单 (${orders.length})` },
          { key: 'checkup',  label: '📅 复查计划' },
        ].map(t => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <>
          {/* Latest vitals */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title"><span>💊</span> 最新健康指标</div>
            <div className="vitals-grid">
              {Object.entries(VITAL_META).map(([type, meta]) => {
                const r = latestVitals[type]
                if (!r) return (
                  <div className="vital-card" key={type} style={{ opacity: 0.5 }}>
                    <div className="vital-label">{meta.label}</div>
                    <div className="vital-value" style={{ fontSize: 16, color: 'var(--text-muted)' }}>暂无数据</div>
                  </div>
                )
                return (
                  <div className="vital-card" key={type}>
                    <div className="vital-label">{meta.label}</div>
                    <div>
                      <span className="vital-value">{meta.fmt(r)}</span>
                      <span className="vital-unit">{meta.unit}</span>
                    </div>
                    <div className="vital-date">{fmtTime(r.recordedAt)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Basic info */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title"><span>👤</span> 基本信息</div>
            <div className="info-grid">
              {[
                { label: '身高', value: user.height ? `${user.height} cm` : '--' },
                { label: '体重', value: user.weight ? `${user.weight} kg` : '--' },
                { label: '吸烟', value: user.smoking || '--' },
                { label: '饮酒', value: user.drinking || '--' },
                { label: '运动', value: user.exercise || '--' },
                { label: '注册时间', value: fmtDate(user.createdAt) },
              ].map((r, i) => (
                <div className="info-row" key={i}>
                  <div className="info-row-label">{r.label}</div>
                  <div className="info-row-value">{r.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Health profile */}
          {user.healthProfile && (
            <div className="card">
              <div className="card-title"><span>🏥</span> 健康档案</div>
              <div className="info-grid">
                {[
                  { label: '血型', value: user.healthProfile.bloodType },
                  { label: '药物过敏', value: user.healthProfile.drugAllergy },
                  { label: '食物过敏', value: user.healthProfile.foodAllergy },
                  { label: '既往病史', value: user.healthProfile.pastHistory },
                  { label: '用药史', value: user.healthProfile.medicHistory },
                  { label: '家族病史', value: user.healthProfile.familyHistory },
                  { label: '手术史', value: user.healthProfile.surgeryHistory },
                ].map((r, i) => r.value ? (
                  <div className="info-row" key={i}>
                    <div className="info-row-label">{r.label}</div>
                    <div className="info-row-value">{r.value}</div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Records */}
      {tab === 'records' && (
        <div className="card">
          <div className="card-title"><span>📈</span> 健康记录</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>类型</th><th>数值</th><th>记录时间</th></tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const meta = VITAL_META[r.type]
                  return (
                    <tr key={r._id}>
                      <td><span className="badge badge-blue">{meta?.label || r.type}</span></td>
                      <td><strong>{meta?.fmt(r) || r.value}</strong> <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{meta?.unit}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{fmtTime(r.recordedAt)}</td>
                    </tr>
                  )
                })}
                {!records.length && <tr><td colSpan={3}><div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-text">暂无健康记录</div></div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div className="card">
          <div className="card-title">
            <span>✅</span> 随访任务
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowTask(true)}>+ 新建任务</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>任务</th><th>分类</th><th>状态</th><th>优先级</th><th>创建时间</th></tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t._id}>
                    <td><strong>{t.title}</strong>{t.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.description}</div>}</td>
                    <td><span className="badge badge-blue">{TASK_CAT[t.category] || t.category}</span></td>
                    <td>
                      <span className={`badge ${t.status === 'completed' ? 'badge-green' : t.status === 'pending' ? 'badge-yellow' : 'badge-gray'}`}>
                        {t.status === 'completed' ? '已完成' : t.status === 'pending' ? '待完成' : t.status}
                      </span>
                    </td>
                    <td>{['', '🔴 高', '🟡 中', '🟢 低'][t.priority] || '--'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtTime(t.createdAt)}</td>
                  </tr>
                ))}
                {!tasks.length && <tr><td colSpan={5}><div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-text">暂无任务</div></div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Messages */}
      {tab === 'messages' && (
        <div className="card">
          <div className="card-title">
            <span>💬</span> 消息记录
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowMsg(true)}>+ 发消息</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map(m => {
              const isUser = m.type === 'user'
              return (
                <div key={m._id} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-start' : 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {isUser ? user.name || '会员' : m.sender} · {fmtTime(m.createdAt)}
                    </span>
                    {!isUser && <span className="badge badge-green" style={{ fontSize: 10 }}>{m.type === 'doctor' ? '医生' : m.type === 'manager' ? '健管师' : '系统'}</span>}
                  </div>
                  {m.title && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{m.title}</div>}
                  <div className={`msg-bubble ${isUser ? 'msg-bubble-incoming' : 'msg-bubble-outgoing'}`}>
                    {m.content}
                  </div>
                </div>
              )
            })}
            {!messages.length && <div className="empty-state"><div className="empty-state-icon">💬</div><div className="empty-state-text">暂无消息记录</div></div>}
          </div>
        </div>
      )}

      {/* Orders */}
      {tab === 'orders' && (
        <div className="card">
          <div className="card-title"><span>📋</span> 服务订单</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>服务</th><th>金额</th><th>状态</th><th>备注</th><th>下单时间</th></tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const sm = STATUS_META[o.status] || STATUS_META.pending
                  return (
                    <tr key={o._id}>
                      <td><strong>{o.serviceName}</strong></td>
                      <td style={{ color: 'var(--primary)', fontWeight: 700 }}>¥{o.servicePrice}</td>
                      <td><span className={`badge ${sm.badge}`}>{sm.label}</span></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{o.note || '--'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtTime(o.createdAt)}</td>
                    </tr>
                  )
                })}
                {!orders.length && <tr><td colSpan={5}><div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">暂无订单</div></div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Checkup Plan */}
      {tab === 'checkup' && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>📅 年度复查计划</span>
            <button className="btn btn-primary btn-sm" disabled={savingCheckup} onClick={async () => {
              setSavingCheckup(true)
              try {
                const res = await adminAPI.saveCheckupPlan({
                  userId: id,
                  title: checkupTitle,
                  note: checkupNote,
                  items: checkupItems.map(({ _local, _id, ...rest }) => rest),
                })
                setCheckupPlan(res.data)
                setCheckupLoaded(false) // 强制重新加载
                toast('✅ 复查计划已保存')
                // 重新加载最新数据
                const fresh = await adminAPI.getCheckupPlan(id)
                setCheckupPlan(fresh.data)
                setCheckupItems(fresh.data?.items?.map(it => ({ ...it, _local: it._id })) || [])
                setCheckupLoaded(true)
              } catch (err) {
                toast('❌ ' + err.message)
              } finally { setSavingCheckup(false) }
            }}>
              {savingCheckup ? '保存中...' : '💾 保存计划'}
            </button>
          </div>

          {!checkupLoaded ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#888' }}>加载中...</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ flex: 2, margin: 0 }}>
                  <label className="form-label">计划标题</label>
                  <input className="form-input" value={checkupTitle} onChange={e => setCheckupTitle(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 3, margin: 0 }}>
                  <label className="form-label">备注说明</label>
                  <input className="form-input" value={checkupNote} onChange={e => setCheckupNote(e.target.value)} placeholder="如：重点关注心功能、每季度复查一次" />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {checkupItems.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#888', padding: 24 }}>暂无复查项目，点击下方添加</div>
                )}
                {checkupItems.map((item, idx) => (
                  <div key={item._local || idx} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: '#f9f6f0', borderRadius: 8, border: '1px solid #E0D9CE' }}>
                    <select value={item.status} style={{ border: '1px solid #ccc', borderRadius: 4, padding: '3px 6px', fontSize: 12,
                      color: item.status === 'done' ? '#22A06B' : item.status === 'overdue' ? '#DC3545' : '#D97706' }}
                      onChange={e => {
                        const items = [...checkupItems]; items[idx] = { ...items[idx], status: e.target.value }; setCheckupItems(items)
                      }}>
                      <option value="pending">待完成</option>
                      <option value="done">已完成</option>
                      <option value="overdue">已逾期</option>
                    </select>
                    <input className="form-input" style={{ flex: 2 }} placeholder="检查项目名称" value={item.name}
                      onChange={e => { const items = [...checkupItems]; items[idx] = { ...items[idx], name: e.target.value }; setCheckupItems(items) }} />
                    <input type="month" className="form-input" style={{ width: 140 }} value={item.targetDate || ''}
                      onChange={e => { const items = [...checkupItems]; items[idx] = { ...items[idx], targetDate: e.target.value }; setCheckupItems(items) }} />
                    <input className="form-input" style={{ flex: 2 }} placeholder="备注" value={item.note || ''}
                      onChange={e => { const items = [...checkupItems]; items[idx] = { ...items[idx], note: e.target.value }; setCheckupItems(items) }} />
                    <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc', flexShrink: 0 }}
                      onClick={() => setCheckupItems(items => items.filter((_, i) => i !== idx))}>×</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-ghost" onClick={() => setCheckupItems(prev => [...prev, {
                _local: Date.now(), name: '', targetDate: '', note: '', status: 'pending'
              }])}>＋ 添加检查项</button>
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {showMsg  && <SendMessageModal userId={id} onClose={() => setShowMsg(false)} onSent={load} />}
      {showTask && <CreateTaskModal  userId={id} onClose={() => setShowTask(false)} onCreated={load} />}
    </>
  )
}
