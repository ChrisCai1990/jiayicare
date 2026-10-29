import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'

const LABELS = { requested: '待处理', processing: '处理中', needs_review: '待核验', failed: '处理失败', completed: '已完成' }
const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'

export default function AccountDeletionPage() {
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    adminAPI.accountDeletionList({ status, page }).then(res => {
      if (active) setData(res.data)
    }).catch(err => { if (active) setError(err.message || '加载失败，请重试') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [status, page, refresh])
  return <>
    <div className="page-header">
      <div><div className="page-title">账号注销</div><div className="page-sub">查看本机构申请及处理期限（北京时间）</div></div>
      <button className="btn" disabled={loading} onClick={() => setRefresh(v => v + 1)}>刷新</button>
    </div>
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <p>客户已在 App 内确认注销。请按申请编号安排后台处理，并核验需要依法保留的交易原件；客户无需另行电话或邮件申请。</p>
      <p>完成状态由实际删除结果生成。此页面不能手工标记完成；备份、日志等后续清理须另外跟进。</p>
      <label>显示 <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
        <option value="pending">待处理及异常</option><option value="completed">已完成</option><option value="all">全部</option>
      </select></label>
      {data && <span style={{ marginLeft: 16 }}>待处理及异常 {data.pending} 条</span>}
    </div>
    {error && <div role="alert" className="card" style={{ padding: 20, color: '#b42318' }}>{error}</div>}
    {loading ? <p role="status">加载中…</p> : data && <div className="card">
      <div className="table-wrap"><table><thead><tr><th>申请编号</th><th>申请时间</th><th>预计完成期限</th><th>状态</th><th>完成时间</th></tr></thead>
        <tbody>{data.items.length ? data.items.map(row => <tr key={row.id}>
          <td style={{ userSelect: 'all' }}>{row.id}</td><td>{time(row.requestedAt)}</td><td>{time(row.dueAt)}{row.overdue && <strong style={{ color: '#b42318' }}> 已超期</strong>}</td>
          <td>{LABELS[row.status] || '待核验'}</td><td>{time(row.completedAt)}</td>
        </tr>) : <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center' }}>当前筛选下暂无申请</td></tr>}</tbody>
      </table></div>
      <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="btn" disabled={page <= 1} onClick={() => setPage(v => v - 1)}>上一页</button>
        <span>第 {page} 页，共 {data.total} 条</span>
        <button className="btn" disabled={page * data.pageSize >= data.total} onClick={() => setPage(v => v + 1)}>下一页</button>
      </div>
    </div>}
  </>
}
