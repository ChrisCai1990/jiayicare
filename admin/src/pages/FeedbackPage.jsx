import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const TYPE_COLOR = {
  '意见建议': '#0077B6',
  '功能异常': '#DC3545',
  '数据问题': '#D97706',
  '其他':     '#8AA89C',
}

export default function FeedbackPage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('') // '' | pending | resolved
  const [replyingId, setReplyingId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.feedbackList(statusFilter ? { status: statusFilter } : {})
      setList(res.data || [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statusFilter])

  const fmtTime = (d) => d ? new Date(d).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'

  const startReply = (fb) => {
    setReplyingId(fb._id)
    setReplyText(fb.reply || '')
  }

  const submitReply = async (id) => {
    if (!replyText.trim()) return
    setSaving(true)
    try {
      await adminAPI.replyFeedback(id, replyText.trim())
      setReplyingId(null)
      setReplyText('')
      toast('✅ 已回复，用户可在App内查看')
      load()
    } catch (err) {
      toast('❌ ' + (err.message || '回复失败'))
    } finally {
      setSaving(false)
    }
  }

  const markResolved = async (id) => {
    try {
      await adminAPI.resolveFeedback(id)
      toast('✅ 已标记为已处理')
      load()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    }
  }

  const pendingCount = list.filter(f => f.status === 'pending').length

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">📮 用户反馈</div>
          <div className="page-sub">共 {list.length} 条{statusFilter === '' ? `，待处理 ${pendingCount} 条` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: '', label: '全部' },
            { v: 'pending', label: '待处理' },
            { v: 'resolved', label: '已处理' },
          ].map(opt => (
            <button
              key={opt.v}
              className={`btn btn-sm ${statusFilter === opt.v ? 'btn-primary' : ''}`}
              onClick={() => setStatusFilter(opt.v)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /> 加载中...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>类型</th>
                  <th>反馈内容</th>
                  <th>提交时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map(fb => (
                  <React.Fragment key={fb._id}>
                    <tr>
                      <td>
                        <div style={{ fontWeight: 700 }}>{fb.user?.name || '未知'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fb.user?.phone}</div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                          color: TYPE_COLOR[fb.type] || '#8AA89C',
                          background: (TYPE_COLOR[fb.type] || '#8AA89C') + '18',
                        }}>{fb.type}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 320 }}>
                        {fb.content}
                        {fb.reply && (
                          <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--bg-subtle, #F2EDE3)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                            已回复：{fb.reply}
                          </div>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtTime(fb.createdAt)}
                      </td>
                      <td>
                        {fb.status === 'resolved'
                          ? <span style={{ color: '#22A06B', fontSize: 12, fontWeight: 600 }}>已处理</span>
                          : <span style={{ color: '#D97706', fontSize: 12, fontWeight: 600 }}>待处理</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {fb.status !== 'resolved' && (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => startReply(fb)}>回复</button>
                            <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => markResolved(fb._id)}>标记已处理</button>
                          </>
                        )}
                      </td>
                    </tr>
                    {replyingId === fb._id && (
                      <tr>
                        <td colSpan={6}>
                          <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
                            <textarea
                              value={replyText}
                              onChange={e => setReplyText(e.target.value)}
                              placeholder="输入回复内容..."
                              rows={2}
                              style={{ flex: 1, borderRadius: 8, border: '1px solid var(--border)', padding: 8, fontSize: 13 }}
                            />
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => submitReply(fb._id)}>提交</button>
                            <button className="btn btn-sm" onClick={() => setReplyingId(null)}>取消</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {list.length === 0 && (
                  <tr><td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-state-icon">📮</div>
                      <div className="empty-state-text">暂无用户反馈</div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
