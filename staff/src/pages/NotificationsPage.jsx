import React, { useEffect, useState, useRef } from 'react'
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
  const [sentReferrals, setSentReferrals] = useState([])
  const [allReceivedReferrals, setAllReceivedReferrals] = useState([])
  const [userMessages, setUserMessages] = useState([])
  const [replyModal, setReplyModal] = useState(null)   // { userId, userName, roleKey }
  const [threadModal, setThreadModal] = useState(null) // { userId, userName, roleKey }

  const load = async () => {
    setLoading(true)
    try {
      const [notifRes, sentRes, receivedRes, msgRes] = await Promise.allSettled([
        staffAPI.getNotifications(),
        staffAPI.getSentReferrals(),
        staffAPI.getReferrals({ direction: 'received', limit: 50 }),
        staffAPI.getUserMessages(),
      ])
      if (notifRes.status === 'fulfilled') setData(notifRes.value.data)
      if (sentRes.status === 'fulfilled') setSentReferrals(sentRes.value.data?.referrals || [])
      if (receivedRes.status === 'fulfilled') setAllReceivedReferrals(receivedRes.value.data?.referrals || [])
      if (msgRes.status === 'fulfilled') setUserMessages(msgRes.value.data || [])
    }
    catch (err) { toast(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const refreshUserMessages = async () => {
    try {
      const res = await staffAPI.getUserMessages()
      if (res.data) setUserMessages(res.data)
    } catch {}
    // 通知侧边栏重新计算红点（读完留言后未读数应立即下降）
    window.dispatchEvent(new Event('notif-refresh'))
  }

  const handleRespond = async (id, status, responseAnalysis, responseOpinion) => {
    try {
      await staffAPI.updateReferral(id, { status, responseAnalysis, responseOpinion })
      toast(status === 'accepted' ? '已接受转介' : status === 'rejected' ? '已拒绝转介' : '已完成转介')
      setRespondModal(null); load()
      window.dispatchEvent(new Event('notif-refresh'))
    } catch (err) { toast(err.message) }
  }

  const handleViewSent = () => {
    setTab('sent')
    staffAPI.markSentReferralsRead()
      .then(() => window.dispatchEvent(new Event('notif-refresh')))
      .catch(() => {})
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
        <button className={`tab-btn ${tab === 'sent' ? 'active' : ''}`} onClick={handleViewSent}>
          📨 我发出的转介
          {(data?.summary?.unreadRepliedCount || 0) > 0 && (
            <span style={{ marginLeft: 4, background: '#DC3545', color: '#fff', borderRadius: 99, padding: '0 6px', fontSize: 11 }}>{data.summary.unreadRepliedCount} 新回复</span>
          )}
        </button>
        <button className={`tab-btn ${tab === 'userMsgs' ? 'active' : ''}`} onClick={() => setTab('userMsgs')}>
          💬 用户留言
          {userMessages.length > 0 && (
            <span style={{ marginLeft: 4, background: '#0077B6', color: '#fff', borderRadius: 99, padding: '0 6px', fontSize: 11 }}>{userMessages.length}</span>
          )}
        </button>
      </div>

      {/* ── 收到的转介 ── */}
      {tab === 'referrals' && (
        <div className="card">
          {allReceivedReferrals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无收到的转介 ✓</div>
          ) : allReceivedReferrals.map((r, i) => (
            <div key={r._id} style={{ padding: '16px', borderBottom: i < allReceivedReferrals.length - 1 ? '1px solid #f5f2ec' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {r.urgency === 'urgent' && (
                      <span style={{ fontSize: 11, background: '#DC3545', color: '#fff', padding: '1px 8px', borderRadius: 99, fontWeight: 600 }}>紧急</span>
                    )}
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{r.reason}</span>
                    <span style={{ fontSize: 12, color: REFERRAL_STATUS_COLOR[r.status], fontWeight: 600 }}>· {REFERRAL_STATUS_LABEL[r.status]}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 4 }}>
                    会员：<strong style={{ cursor: 'pointer', color: '#1E6B50' }} onClick={() => nav(`/patients/${r.patientId?._id}`)}>{r.patientId?.name}</strong>
                    <span style={{ color: '#aaa', marginLeft: 6 }}>{r.patientId?.phone}</span>
                  </div>
                  {r.content && <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{r.content}</div>}
                  {r.attachedHealthInfo && <AttachedHealthInfoView info={r.attachedHealthInfo} />}
                  <div style={{ fontSize: 12, color: '#aaa' }}>
                    来自：{r.fromStaffId?.name} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                  {(r.responseAnalysis || r.responseOpinion || r.response) && (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0faf5', borderRadius: 6, borderLeft: '3px solid #22A06B', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, color: '#8AA89C' }}>我的回复 · {r.respondedAt ? new Date(r.respondedAt).toLocaleDateString('zh-CN') : ''}</div>
                      {r.responseAnalysis && (
                        <div>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 2 }}>当前问题分析</div>
                          <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.responseAnalysis}</div>
                        </div>
                      )}
                      {r.responseOpinion && (
                        <div>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 2 }}>会诊意见</div>
                          <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.responseOpinion}</div>
                        </div>
                      )}
                      {r.response && !r.responseAnalysis && !r.responseOpinion && (
                        <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.response}</div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexDirection: 'column', alignItems: 'flex-end' }}>
                  {r.status === 'pending' && <>
                    <button className="btn btn-primary btn-sm" onClick={() => setRespondModal({ ...r, action: 'accept' })}>接受</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setRespondModal({ ...r, action: 'reject' })}>拒绝</button>
                  </>}
                  {r.status === 'accepted' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setRespondModal({ ...r, action: 'complete' })}>完成转介</button>
                  )}
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

      {/* ── 我发出的转介 ── */}
      {tab === 'sent' && (
        <div className="card">
          {sentReferrals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无发出的转介记录</div>
          ) : sentReferrals.map((r, i) => (
            <div key={r._id} style={{ padding: '16px', borderBottom: i < sentReferrals.length - 1 ? '1px solid #f5f2ec' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{r.reason}</span>
                    <span style={{ fontSize: 12, color: REFERRAL_STATUS_COLOR[r.status], fontWeight: 600 }}>
                      · {REFERRAL_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 4 }}>
                    会员：<strong style={{ cursor: 'pointer', color: '#1E6B50' }} onClick={() => nav(`/patients/${r.patientId?._id}`)}>{r.patientId?.name}</strong>
                    <span style={{ color: '#aaa', marginLeft: 6 }}>{r.patientId?.phone}</span>
                  </div>
                  {r.content && <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{r.content}</div>}
                  {r.attachedHealthInfo && <AttachedHealthInfoView info={r.attachedHealthInfo} />}
                  <div style={{ fontSize: 12, color: '#aaa' }}>
                    接收方：{r.toStaffId?.name} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                  {(r.responseAnalysis || r.responseOpinion || r.response) ? (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0faf5', borderRadius: 6, borderLeft: '3px solid #22A06B', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, color: '#8AA89C' }}>对方回复 · {r.respondedAt ? new Date(r.respondedAt).toLocaleDateString('zh-CN') : ''}</div>
                      {r.responseAnalysis && (
                        <div>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 2 }}>当前问题分析</div>
                          <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.responseAnalysis}</div>
                        </div>
                      )}
                      {r.responseOpinion && (
                        <div>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 2 }}>会诊意见</div>
                          <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.responseOpinion}</div>
                        </div>
                      )}
                      {r.response && !r.responseAnalysis && !r.responseOpinion && (
                        <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.response}</div>
                      )}
                    </div>
                  ) : r.status === 'completed' ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#22A06B' }}>✓ 已完成，对方未填写回复说明</div>
                  ) : r.status === 'accepted' ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#0077B6' }}>已接受，等待完成...</div>
                  ) : r.status === 'rejected' ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#DC3545' }}>已拒绝，未填写原因</div>
                  ) : (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#aaa' }}>等待对方回复...</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 用户留言（会话模式）── */}
      {tab === 'userMsgs' && (
        <div className="card">
          {userMessages.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无用户留言</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {Object.values(userMessages.reduce((acc, m) => {
                const key = `${m.user}_${m.recipient || 'manager'}`
                if (!acc[key] || new Date(m.createdAt) > new Date(acc[key].createdAt)) {
                  acc[key] = { ...m, hasUnread: m.staffUnread }
                } else if (m.staffUnread) {
                  acc[key].hasUnread = true
                }
                return acc
              }, {})).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((m, i, arr) => {
                const roleKey = m.recipient === 'doctor' ? 'doctor' : m.recipient === 'nutritionist' ? 'nutritionist' : 'manager'
                return (
                  <div key={`${m.user}_${roleKey}`} style={{ padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid #f5f2ec' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    cursor: 'pointer', transition: 'background 0.1s',
                    background: m.hasUnread ? '#FFFBF5' : '' }}
                    onClick={() => setThreadModal({ userId: m.user, userName: m.patientName, roleKey })}
                    onMouseEnter={e => e.currentTarget.style.background = '#faf9f6'}
                    onMouseLeave={e => e.currentTarget.style.background = m.hasUnread ? '#FFFBF5' : ''}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1E6B5018', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                          {m.patientName?.[0] || '?'}
                        </div>
                        {m.hasUnread && <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#DC3545', border: '2px solid #fff' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontWeight: m.hasUnread ? 700 : 600, fontSize: 14 }}>{m.patientName}</span>
                          <span style={{ fontSize: 11, color: '#aaa' }}>{m.patientPhone}</span>
                          <span style={{ fontSize: 11, background: '#f0f0f0', color: '#666', padding: '1px 7px', borderRadius: 99 }}>
                            {roleKey === 'doctor' ? '家庭医师' : roleKey === 'nutritionist' ? '营养师' : '健管师'}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: '#4A6558', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(m.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); setThreadModal({ userId: m.user, userName: m.patientName, roleKey }) }}>查看对话</button>
                      <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); nav(`/patients/${m.user}`) }}>档案</button>
                    </div>
                  </div>
                )
              })}
            </div>
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

      {/* 对话线程弹窗 */}
      {threadModal && (
        <ThreadModal
          userId={threadModal.userId}
          userName={threadModal.userName}
          roleKey={threadModal.roleKey}
          onClose={() => { setThreadModal(null); refreshUserMessages() }}
          onSent={() => { toast('回复已发送'); /* 不关闭，线程会自动刷新 */ }}
          onNavigate={nav}
        />
      )}

      {/* 回复用户留言弹窗（保留备用） */}
      {replyModal && (
        <ReplyModal
          userId={replyModal.userId}
          userName={replyModal.userName}
          onClose={() => setReplyModal(null)}
          onSent={() => { setReplyModal(null); toast('回复已发送') }}
        />
      )}
    </div>
  )
}

// ── 转介回复弹窗 ──
function RespondModal({ referral, onClose, onRespond }) {
  const toast = useToast()
  const [responseAnalysis, setResponseAnalysis] = useState('')
  const [responseOpinion, setResponseOpinion] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [summary, setSummary] = useState('')   // 接收人填写的处理概要，供AI扩写
  const [submitting, setSubmitting] = useState(false)
  const [aiDrafting, setAiDrafting] = useState(false)
  const isAccept = referral.action === 'accept'
  const isComplete = referral.action === 'complete'
  const isReject = referral.action === 'reject'

  const nextStatus = isAccept ? 'accepted' : isComplete ? 'completed' : 'rejected'

  const handleAiDraft = async () => {
    setAiDrafting(true)
    try {
      const r = await staffAPI.generateAIReferralResponseDraft(referral._id, summary)
      setResponseAnalysis(r.data.responseAnalysis || '')
      setResponseOpinion(r.data.responseOpinion || '')
    } catch (err) { toast(err.message || 'AI生成失败') }
    finally { setAiDrafting(false) }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onRespond(
        referral._id,
        nextStatus,
        isReject ? rejectReason : responseAnalysis,
        isReject ? '' : responseOpinion,
      )
    }
    finally { setSubmitting(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isAccept ? '✓ 接受转介' : isComplete ? '✅ 完成转介' : '✗ 拒绝转介'}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: '12px', background: '#f9f7f3', borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{referral.reason}</div>
            <div style={{ fontSize: 13, color: '#666' }}>会员：{referral.patientId?.name}</div>
            {referral.content && <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{referral.content}</div>}
            {referral.attachedHealthInfo && <AttachedHealthInfoView info={referral.attachedHealthInfo} />}
          </div>
          {isReject ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">拒绝原因 *</label>
              <textarea className="form-input" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="请说明拒绝原因..." />
            </div>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0, background: '#F7F9FC', borderRadius: 8, padding: '10px 12px' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📝 处理概要</span>
                  <span style={{ fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>用几句话写下你的处理思路，AI 会据此扩写成完整回复</span>
                </label>
                <textarea className="form-input" rows={2} value={summary} onChange={e => setSummary(e.target.value)}
                  placeholder="例：血压控制不佳，建议调整降压方案并加强随访监测..." />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={aiDrafting} onClick={handleAiDraft}>
                    {aiDrafting ? 'AI生成中…' : (summary.trim() ? '✨ 按概要生成草稿' : '✨ AI生成草稿')}
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">问题分析{isAccept ? '（可选）' : ''}</label>
                <textarea className="form-input" rows={3} value={responseAnalysis} onChange={e => setResponseAnalysis(e.target.value)}
                  placeholder="对会员当前问题的分析评估..." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">会诊意见{isAccept ? '（可选）' : ''}</label>
                <textarea className="form-input" rows={3} value={responseOpinion} onChange={e => setResponseOpinion(e.target.value)}
                  placeholder="会诊结论、后续建议、转归方向..." />
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className={`btn ${isReject ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleSubmit} disabled={submitting || (isReject && !rejectReason)}>
            {submitting ? '提交中...' : isAccept ? '确认接受' : isComplete ? '确认完成' : '确认拒绝'}
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

// ── 回复用户留言弹窗 ──
function ReplyModal({ userId, userName, onClose, onSent }) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (!content.trim()) { setErr('请输入回复内容'); return }
    setSubmitting(true)
    try {
      await staffAPI.replyToUser(userId, content.trim())
      onSent()
    } catch (e) {
      setErr(e.message || '发送失败')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3 className="modal-title">回复 {userName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">回复内容</label>
            <textarea className="form-input" rows={4} value={content}
              onChange={e => { setContent(e.target.value); setErr('') }}
              placeholder="输入回复内容，用户将在消息中心收到您的回复..." />
          </div>
          {err && <div style={{ color: '#DC3545', fontSize: 13, marginTop: 6 }}>{err}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '发送中...' : '发送回复'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 对话线程弹窗 ──
const CHAT_DRAFT_RANGE_LABEL = { today: '当日', '3d': '近3天', week: '近1周' }
const CHAT_DRAFT_RANGE_OPTIONS = { doctor: ['today', '3d'], manager: ['today', '3d', 'week'], nutritionist: ['today', '3d', 'week'] }
const CHAT_DRAFT_DEFAULT_RANGE = { doctor: 'today', manager: 'today', nutritionist: 'week' }

function ThreadModal({ userId, userName, roleKey, onClose, onSent, onNavigate }) {
  const toast = useToast()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [draftRange, setDraftRange] = useState(CHAT_DRAFT_DEFAULT_RANGE[roleKey] || 'today')
  const [draftGenerating, setDraftGenerating] = useState(false)
  const [draftReview, setDraftReview] = useState(null)
  const bottomRef = useRef(null)

  const ROLE_LABEL = { doctor: '家庭医师', nutritionist: '营养师', manager: '健管师' }

  const handleGenerateDraft = async () => {
    setDraftGenerating(true)
    try {
      const res = await staffAPI.generateChatFollowupDraft(userId, roleKey, draftRange)
      if (res.reused) toast('已有待审核的草稿')
      setDraftReview(res.data)
    } catch (e) { toast(e.message || '生成失败') }
    finally { setDraftGenerating(false) }
  }

  const loadThread = async () => {
    try {
      const res = await staffAPI.getUserMessageThread(userId, roleKey)
      setMessages(res.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadThread() }, [userId, roleKey])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    if (!content.trim()) { setErr('请输入回复内容'); return }
    setSubmitting(true); setErr('')
    try {
      await staffAPI.replyToUser(userId, content.trim())
      setContent('')
      onSent()
      await loadThread()
    } catch (e) { setErr(e.message || '发送失败') }
    finally { setSubmitting(false) }
  }

  const fmtTime = t => new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h3 className="modal-title">与 {userName} 的对话</h3>
            <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>频道：{ROLE_LABEL[roleKey] || roleKey}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="form-input" value={draftRange} onChange={e => setDraftRange(e.target.value)}
              style={{ fontSize: 12, padding: '4px 6px', width: 'auto' }}>
              {(CHAT_DRAFT_RANGE_OPTIONS[roleKey] || ['today']).map(r => <option key={r} value={r}>{CHAT_DRAFT_RANGE_LABEL[r]}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" disabled={draftGenerating} onClick={handleGenerateDraft}>
              {draftGenerating ? '生成中…' : '🤖 生成随访草稿'}
            </button>
            {onNavigate && <button className="btn btn-secondary btn-sm" onClick={() => { onNavigate(`/patients/${userId}`); onClose() }}>查看档案</button>}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, background: '#faf9f6' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>加载中...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>暂无消息记录</div>
          ) : messages.map(m => {
            const isUser = m.type === 'user'
            return (
              <div key={m._id} style={{ display: 'flex', flexDirection: isUser ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: isUser ? '#E0D9CE' : '#1E6B5020',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600,
                  color: isUser ? '#4A6558' : '#1E6B50', flexShrink: 0 }}>
                  {isUser ? (userName?.[0] || '?') : '医'}
                </div>
                <div style={{ maxWidth: '72%' }}>
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 3, textAlign: isUser ? 'left' : 'right', display: 'flex', alignItems: 'center', gap: 4, justifyContent: isUser ? 'flex-start' : 'flex-end' }}>
                    <span>{isUser ? userName : m.sender} · {fmtTime(m.createdAt)}</span>
                    {m.isAI && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: '#D9780618', padding: '1px 6px', borderRadius: 99 }}>AI已代答</span>
                    )}
                  </div>
                  <div style={{
                    padding: '10px 14px', borderRadius: isUser ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                    background: isUser ? '#fff' : (m.isAI ? '#D97706' : '#1E6B50'), color: isUser ? '#1A2B24' : '#fff',
                    fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}>{m.content}</div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <div style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid #f0ede8', background: '#fff' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea className="form-input" rows={2} value={content}
              onChange={e => { setContent(e.target.value); setErr('') }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="输入回复，Enter 发送，Shift+Enter 换行..."
              style={{ flex: 1, resize: 'none', fontSize: 13 }} />
            <button className="btn btn-primary" onClick={handleSend} disabled={submitting} style={{ alignSelf: 'stretch' }}>
              {submitting ? '…' : '发送'}
            </button>
          </div>
          {err && <div style={{ color: '#DC3545', fontSize: 12, marginTop: 4 }}>{err}</div>}
        </div>
      </div>
      {draftReview && (
        <DraftReviewModal draft={draftReview} onClose={() => setDraftReview(null)}
          onDone={() => { setDraftReview(null); toast('已确认入档') }} />
      )}
    </div>
  )
}

// ── AI生成随访草稿的审核弹窗（聊天记录提炼稿，需专员核实后确认入档）──
function DraftReviewModal({ draft, onClose, onDone }) {
  const toast = useToast()
  const isDoctorDraft = draft.type === 'doctor_followup'
  const [form, setForm] = useState({
    title: draft.title || '', content: draft.content || '', result: draft.result || '',
    nextDate: draft.nextDate ? new Date(draft.nextDate).toISOString().slice(0, 10) : '',
  })
  const [saving, setSaving] = useState(false)

  const handleApprove = async () => {
    setSaving(true)
    try {
      await staffAPI.reviewRoutineDraft(draft._id, { action: 'approve', edits: { ...form, nextDate: form.nextDate || null } })
      onDone()
    } catch (e) { toast(e.message || '保存失败') }
    finally { setSaving(false) }
  }

  const handleDiscard = async () => {
    if (!window.confirm('确定丢弃这条AI草稿？')) return
    setSaving(true)
    try {
      await staffAPI.reviewRoutineDraft(draft._id, { action: 'discard' })
      toast('已丢弃'); onClose()
    } catch (e) { toast(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 className="modal-title">审核AI生成的{isDoctorDraft ? '医生随访' : '随访'}记录</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isDoctorDraft ? (
            <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '8px 10px', borderRadius: 6 }}>
              ⚠️ 涉及医疗沟通内容，AI仅客观提炼聊天记录，不构成诊疗建议，请医生本人核实内容准确性后再确认入档
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#7C3AED', background: '#7C3AED10', padding: '6px 10px', borderRadius: 6 }}>
              此内容由AI根据与患者的聊天记录自动提炼，请核实后再确认入档
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: '#8AA89C' }}>标题</label>
            <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#8AA89C' }}>{isDoctorDraft ? '沟通要点' : '随访要点'}</label>
            <textarea className="form-control" rows={5} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
          </div>
          {!isDoctorDraft && (
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>结论/评估</label>
              <textarea className="form-control" rows={2} value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} />
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: '#8AA89C' }}>下次随访日期（可选）</label>
            <input type="date" className="form-control" value={form.nextDate} onChange={e => setForm(f => ({ ...f, nextDate: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" disabled={saving} onClick={handleDiscard}>丢弃</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleApprove}>{saving ? '保存中…' : '确认入档'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 附带健康档案展示组件 ──
const HEALTH_SECTION_LABELS = {
  basicInfo:       '基本信息',
  foodAllergy:     '食物过敏',
  drugAllergy:     '药物过敏',
  medicalHistory:  '既往病史',
  specialDiseases: '特殊疾病史',
  familyHistory:   '家族史',
  longTermMeds:    '长期用药',
  longTermSups:    '长期营养补剂',
  dietSummary:     '膳食调查概述',
  latestVitals:    '近期打卡数据',
  allergies:       '过敏史',
  medications:     '当前用药',
  surgeries:       '手术史',
  recentSymptoms:  '近期症状',
}

function AttachedHealthInfoView({ info }) {
  if (!info) return null
  const sections = Object.keys(info).filter(k => {
    const v = info[k]
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  })
  if (sections.length === 0) return null

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0f6ff', borderRadius: 6, borderLeft: '3px solid #0077B6' }}>
      <div style={{ fontSize: 11, color: '#0077B6', fontWeight: 600, marginBottom: 6 }}>附带健康档案</div>
      {sections.map(k => {
        const v = info[k]
        const label = HEALTH_SECTION_LABELS[k] || k
        let display = ''
        if (Array.isArray(v)) {
          display = v.map(item => typeof item === 'object' ? Object.values(item).filter(Boolean).join(' · ') : item).join('；')
        } else {
          display = String(v)
        }
        return (
          <div key={k} style={{ fontSize: 12, color: '#1A2B24', marginBottom: 3 }}>
            <span style={{ color: '#4A6558', marginRight: 4 }}>{label}：</span>{display}
          </div>
        )
      })}
    </div>
  )
}
