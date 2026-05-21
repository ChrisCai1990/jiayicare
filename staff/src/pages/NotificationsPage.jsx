import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const PUSH_TYPE_LABEL = { knowledge:'科普', questionnaire:'问卷', plan:'方案', product:'产品', supplement:'营养素', notice:'通知' }
const PUSH_TYPE_COLOR = { knowledge:'#22A06B', questionnaire:'#0077B6', plan:'#D97706', product:'#1E6B50', supplement:'#8e44ad', notice:'#666' }
const REFERRAL_STATUS_LABEL = { pending:'待处理', accepted:'已接受', completed:'已完成', rejected:'已拒绝' }
const REFERRAL_STATUS_COLOR = { pending:'#D97706', accepted:'#0077B6', completed:'#22A06B', rejected:'#DC3545' }

export default function NotificationsPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('referrals')
  const [respondModal, setRespondModal] = useState(null)
  const [detailModal, setDetailModal] = useState(null)   // push 消息详情

  const load = async () => {
    setLoading(true)
    try { setData((await staffAPI.getNotifications()).data) }
    catch (err) { toast(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleRespond = async (id, status, response) => {
    try {
      await staffAPI.updateReferral(id, { status, response })
      toast(status === 'accepted' ? '已接受转介' : status === 'rejected' ? '已拒绝转介' : '已完成转介')
      setRespondModal(null); load()
    } catch (err) { toast(err.message) }
  }

  if (loading) return <div className="page-loading">加载中...</div>

  const { recentPushes = [], pendingReferrals = [], expiringPatients = [], summary = {} } = data || {}

  const daysLeft = (dateStr) => {
    const diff = new Date(dateStr) - new Date()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const unreadPushes = recentPushes.filter(p => !p.readAt)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">消息通知</h1>
        {tab === 'pushes' && unreadPushes.length > 0 && (
          <button className="btn btn-secondary btn-sm"
            onClick={() => toast('批量已读功能需后端支持，即将上线')}>
            全部标为已读（{unreadPushes.length}）
          </button>
        )}
      </div>

      {/* 汇总徽章 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { key: 'referrals', icon: '🔀', label: '待处理转介', value: summary.pendingReferralCount || 0, color: '#D97706', urgent: (summary.pendingReferralCount || 0) > 0 },
          { key: 'pushes',    icon: '📤', label: '推送记录',   value: summary.pushCount || 0,           color: '#1E6B50', urgent: false },
          { key: 'expiring',  icon: '⏰', label: '即将到期',   value: summary.expiringCount || 0,       color: '#DC3545', urgent: (summary.expiringCount || 0) > 0 },
        ].map(c => (
          <div key={c.key} className="card" style={{ padding: 20, cursor: 'pointer', border: tab === c.key ? `2px solid ${c.color}` : '1px solid #E0D9CE', position: 'relative' }}
            onClick={() => setTab(c.key)}>
            {c.urgent && c.value > 0 && (
              <div style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', background: '#DC3545' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 12, color: '#8AA89C' }}>{c.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab 标签 */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab-btn ${tab === 'referrals' ? 'active' : ''}`} onClick={() => setTab('referrals')}>
          🔀 收到的转介
          {summary.pendingReferralCount > 0 && (
            <span style={{ marginLeft: 4, background: '#D97706', color: '#fff', borderRadius: 99, padding: '0 6px', fontSize: 11 }}>{summary.pendingReferralCount}</span>
          )}
        </button>
        <button className={`tab-btn ${tab === 'pushes' ? 'active' : ''}`} onClick={() => setTab('pushes')}>
          📤 推送状态
          {unreadPushes.length > 0 && (
            <span style={{ marginLeft: 4, background: '#1E6B50', color: '#fff', borderRadius: 99, padding: '0 6px', fontSize: 11 }}>{unreadPushes.length}未读</span>
          )}
        </button>
        <button className={`tab-btn ${tab === 'expiring' ? 'active' : ''}`} onClick={() => setTab('expiring')}>
          ⏰ 到期提醒
          {summary.expiringCount > 0 && (
            <span style={{ marginLeft: 4, background: '#DC3545', color: '#fff', borderRadius: 99, padding: '0 6px', fontSize: 11 }}>{summary.expiringCount}</span>
          )}
        </button>
      </div>

      {/* ── 收到的转介 ── */}
      {tab === 'referrals' && (
        <div className="card">
          {pendingReferrals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无待处理转介 ✓</div>
          ) : pendingReferrals.map((r, i) => (
            <div key={r._id} style={{ padding: '16px', borderBottom: i < pendingReferrals.length - 1 ? '1px solid #f5f2ec' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {r.urgency === 'urgent' && (
                      <span style={{ fontSize: 11, background: '#DC3545', color: '#fff', padding: '1px 8px', borderRadius: 99, fontWeight: 600 }}>紧急</span>
                    )}
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{r.reason}</span>
                    <span style={{ fontSize: 12, color: REFERRAL_STATUS_COLOR[r.status] }}>· {REFERRAL_STATUS_LABEL[r.status]}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 4 }}>
                    会员：<strong style={{ cursor: 'pointer', color: '#1E6B50' }} onClick={() => nav(`/patients/${r.patientId?._id}`)}>{r.patientId?.name}</strong>
                    <span style={{ color: '#aaa', marginLeft: 6 }}>{r.patientId?.phone}</span>
                  </div>
                  {r.content && <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{r.content}</div>}
                  <div style={{ fontSize: 12, color: '#aaa' }}>
                    来自：{r.fromStaffId?.name} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setRespondModal({ ...r, action: 'accept' })}>接受</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setRespondModal({ ...r, action: 'reject' })}>拒绝</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 推送状态 ── */}
      {tab === 'pushes' && (
        <div className="card">
          {recentPushes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无推送记录</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>推送内容</th><th>类型</th><th>接收会员</th><th>阅读状态</th><th>推送时间</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {recentPushes.map(r => (
                  <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => setDetailModal(r)}>
                    <td style={{ maxWidth: 200 }}>
                      <span style={{ fontWeight: 500, color: '#1A2B24' }}>{r.title}</span>
                    </td>
                    <td>
                      <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 12,
                        background: (PUSH_TYPE_COLOR[r.type] || '#666') + '15', color: PUSH_TYPE_COLOR[r.type] || '#666' }}>
                        {PUSH_TYPE_LABEL[r.type] || r.type}
                      </span>
                    </td>
                    <td style={{ color: '#666' }}>{r.patientId?.name || '-'}</td>
                    <td>
                      {r.readAt
                        ? <span style={{ color: '#22A06B', fontSize: 13 }}>✓ 已读 <span style={{ color: '#aaa', fontSize: 11 }}>{new Date(r.readAt).toLocaleDateString('zh-CN')}</span></span>
                        : <span style={{ color: '#D97706', fontSize: 13, fontWeight: 500 }}>● 未读</span>}
                    </td>
                    <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setDetailModal(r)}>查看详情</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 到期提醒 ── */}
      {tab === 'expiring' && (
        <div className="card">
          {expiringPatients.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>近30天内无即将到期会员 🎉</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>会员</th><th>会员类型</th><th>到期日期</th><th>剩余天数</th><th>操作</th></tr>
              </thead>
              <tbody>
                {expiringPatients.map(p => {
                  const left = daysLeft(p.serviceExpiry)
                  return (
                    <tr key={p._id}>
                      <td>
                        <strong style={{ cursor: 'pointer', color: '#1E6B50' }} onClick={() => nav(`/patients/${p._id}`)}>{p.name}</strong>
                        <div style={{ fontSize: 12, color: '#aaa' }}>{p.phone}</div>
                      </td>
                      <td><span className="badge badge-success">{p.servicePackage || '-'}</span></td>
                      <td style={{ color: '#666', fontSize: 13 }}>{new Date(p.serviceExpiry).toLocaleDateString('zh-CN')}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 15, color: left <= 7 ? '#DC3545' : left <= 14 ? '#D97706' : '#22A06B' }}>{left}</span>
                        <span style={{ color: '#aaa', fontSize: 12 }}> 天</span>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => nav(`/patients/${p._id}`)}>查看档案</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 转介回复弹窗 */}
      {respondModal && (
        <RespondModal referral={respondModal} onClose={() => setRespondModal(null)} onRespond={handleRespond} />
      )}

      {/* 推送消息详情弹窗 */}
      {detailModal && (
        <PushDetailModal push={detailModal} onClose={() => setDetailModal(null)} onNavigate={nav} />
      )}
    </div>
  )
}

// ── 转介回复弹窗 ──
function RespondModal({ referral, onClose, onRespond }) {
  const [response, setResponse] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isAccept = referral.action === 'accept'

  const handleSubmit = async () => {
    setSubmitting(true)
    try { await onRespond(referral._id, isAccept ? 'accepted' : 'rejected', response) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3 className="modal-title">{isAccept ? '✓ 接受转介' : '✗ 拒绝转介'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: '12px', background: '#f9f7f3', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{referral.reason}</div>
            <div style={{ fontSize: 13, color: '#666' }}>会员：{referral.patientId?.name}</div>
            {referral.content && <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{referral.content}</div>}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{isAccept ? '接受说明（可选）' : '拒绝原因 *'}</label>
            <textarea className="form-input" rows={3} value={response} onChange={e => setResponse(e.target.value)}
              placeholder={isAccept ? '说明接诊安排或计划...' : '请说明拒绝原因...'} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className={`btn ${isAccept ? 'btn-primary' : 'btn-danger'}`}
            onClick={handleSubmit} disabled={submitting || (!isAccept && !response)}>
            {submitting ? '提交中...' : isAccept ? '确认接受' : '确认拒绝'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 推送消息详情弹窗 ──
function PushDetailModal({ push, onClose, onNavigate }) {
  const typeColor = PUSH_TYPE_COLOR[push.type] || '#666'
  const typeLabel = PUSH_TYPE_LABEL[push.type] || push.type

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title">消息详情</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 类型 + 阅读状态 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ padding: '3px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
              background: typeColor + '15', color: typeColor }}>{typeLabel}</span>
            {push.readAt
              ? <span style={{ fontSize: 12, color: '#22A06B' }}>✓ 已读 · {new Date(push.readAt).toLocaleDateString('zh-CN')}</span>
              : <span style={{ fontSize: 12, color: '#D97706', fontWeight: 500 }}>● 未读</span>}
          </div>

          {/* 标题 */}
          <div>
            <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>推送标题</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2B24' }}>{push.title}</div>
          </div>

          {/* 内容 */}
          {push.content && (
            <div>
              <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>推送内容</div>
              <div style={{ fontSize: 14, color: '#4A6558', lineHeight: 1.7, whiteSpace: 'pre-wrap',
                background: '#f9f7f3', borderRadius: 8, padding: '10px 14px' }}>{push.content}</div>
            </div>
          )}

          {/* 会员信息 */}
          {push.patientId && (
            <div style={{ background: '#f0f9f5', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>接收会员</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600, color: '#1A2B24' }}>{push.patientId.name}</span>
                  <span style={{ fontSize: 12, color: '#8AA89C', marginLeft: 8 }}>{push.patientId.phone}</span>
                </div>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => { onNavigate(`/patients/${push.patientId._id}`); onClose() }}>
                  查看档案
                </button>
              </div>
            </div>
          )}

          {/* 推送时间 */}
          <div style={{ fontSize: 12, color: '#aaa' }}>
            推送时间：{new Date(push.createdAt).toLocaleString('zh-CN')}
          </div>

          {/* 产品/服务推送：跳转商城 */}
          {(push.type === 'product' || push.type === 'supplement') && push.linkUrl && (
            <a href={push.linkUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', textAlign: 'center', padding: '10px', background: '#1E6B50',
                color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
              🛍 查看商品详情
            </a>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
