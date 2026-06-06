import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'
import FollowUpModal from '../components/FollowUpModal'

const TYPE_MAP   = { phone: '电话', wechat: '微信', visit: '上门', video: '视频', other: '其他' }
const STATUS_MAP = { planned: '待随访', in_progress: '随访中', missed: '随访中', completed: '已随访', cancelled: '已取消' }
const STATUS_COLOR = { planned: '#D97706', in_progress: '#0077B6', missed: '#0077B6', completed: '#22A06B', cancelled: '#8AA89C' }

const STATUS_TABS = [
  { v: '',            l: '全部' },
  { v: 'planned',     l: '待随访' },
  { v: 'in_progress', l: '随访中' },
  { v: 'completed',   l: '已随访' },
  { v: 'cancelled',   l: '已取消' },
]

const TYPE_OPTIONS = [
  { v: 'phone',  l: '电话' },
  { v: 'wechat', l: '微信' },
  { v: 'visit',  l: '上门' },
  { v: 'video',  l: '视频' },
  { v: 'other',  l: '其他' },
]

function DetailModal({ item, onClose }) {
  if (!item) return null
  const FOLLOWUP_TYPE = { phone: '电话随访', wechat: '微信随访', visit: '上门随访', video: '视频随访', other: '其他随访' }
  const ROUTINE_PERIOD = { 双周: '双周随访', 月度: '月度随访', 季度: '季度随访' }

  const Row = ({ label, value }) => value ? (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0ece4' }}>
      <span style={{ minWidth: 90, fontSize: 12, color: '#8AA89C', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1A2B24', whiteSpace: 'pre-line', flex: 1 }}>{value}</span>
    </div>
  ) : null

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 600, width: '96%' }}>
        <div className="modal-header">
          <h3 className="modal-title">随访详情 · {item.patientId?.name}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Row label="会员" value={`${item.patientId?.name}  ${item.patientId?.phone || ''}`} />
          <Row label="计划日期" value={new Date(item.date).toLocaleDateString('zh-CN')} />
          <Row label="随访主题" value={item.theme} />
          <Row label="随访方式" value={FOLLOWUP_TYPE[item.type] || item.type} />
          {item.routinePeriod && <Row label="周期类型" value={ROUTINE_PERIOD[item.routinePeriod] || item.routinePeriod} />}
          <Row label="负责人员" value={item.assignedTo?.name} />
          <Row label="状态" value={STATUS_MAP[item.status] || item.status} />
          {item.checkInItems?.length > 0 && <Row label="打卡项目" value={item.checkInItems.join('、')} />}
          <Row label="计划内容" value={item.content} />
          {item.status === 'completed' && (
            <>
              <div style={{ margin: '12px 0 6px', fontSize: 12, color: '#1E6B50', fontWeight: 700, borderTop: '2px solid #E8F5EF', paddingTop: 12 }}>随访结果</div>
              <Row label="执行方式" value={FOLLOWUP_TYPE[item.executedType] || item.executedType} />
              <Row label="随访记录" value={item.executedContent} />
              <Row label="完成时间" value={item.completedAt ? new Date(item.completedAt).toLocaleString('zh-CN') : ''} />
            </>
          )}
          {item.status === 'cancelled' && <Row label="取消原因" value={item.cancelReason} />}
          {/* 扩展字段（随访表单 extras） */}
          {item.extras && Object.keys(item.extras).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#1E6B50', fontWeight: 700, marginBottom: 8 }}>随访表单数据</div>
              {Object.entries(item.extras).map(([k, v]) => (
                typeof v === 'object' ? null :
                <Row key={k} label={k} value={String(v)} />
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
          <button className="btn btn-ghost" onClick={() => { onClose(); }}>
            跳转会员详情
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FollowUpsPage() {
  const nav   = useNavigate()
  const toast = useToast()

  const [followUps,    setFollowUps]    = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const todayStr = new Date().toISOString().slice(0, 10)
  const [statusTab,    setStatusTab]    = useState('planned')
  const [patientName,  setPatientName]  = useState('')
  const [dateFrom,     setDateFrom]     = useState(todayStr)
  const [dateTo,       setDateTo]       = useState('')
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)  // 保留状态但不再使用新建入口
  // 注：dateFrom 默认今天开始，dateTo 默认空（不限结束），显示所有待随访记录

  // 执行随访 modal
  const [execItem,     setExecItem]     = useState(null)
  const [execForm,     setExecForm]     = useState({ type: 'phone', content: '', status: 'completed' })
  const [execSaving,   setExecSaving]   = useState(false)

  // 取消随访 modal
  const [cancelItem,   setCancelItem]   = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)

  // 查看详情
  const [detailItem, setDetailItem] = useState(null)

  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getFollowUps({ page, limit, status: statusTab, patientName, dateFrom, dateTo })
      setFollowUps(res.data.followUps)
      setTotal(res.data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, statusTab, patientName, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const handleSearch = (e) => { e.preventDefault(); setPage(1); load() }

  const openExec = (f) => {
    setExecItem(f)
    setExecForm({ type: f.type || 'phone', content: '', status: 'completed' })
  }

  const handleExec = async () => {
    if (!execForm.content.trim()) { toast('请填写随访结果'); return }
    setExecSaving(true)
    try {
      await staffAPI.updateFollowUp(execItem._id, {
        type: execForm.type,
        content: execForm.content,
        status: execForm.status,
      })
      toast('随访记录已更新')
      setExecItem(null)
      load()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setExecSaving(false) }
  }

  const openCancel = (f) => { setCancelItem(f); setCancelReason('') }

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast('请填写取消原因'); return }
    setCancelSaving(true)
    try {
      await staffAPI.updateFollowUp(cancelItem._id, { status: 'cancelled', cancelReason })
      toast('已取消随访')
      setCancelItem(null)
      load()
    } catch (err) { toast(err.message || '操作失败') }
    finally { setCancelSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条随访记录吗？')) return
    try {
      await staffAPI.deleteFollowUp(id)
      toast('已删除')
      load()
    } catch (err) { toast(err.message || '删除失败') }
  }

  const isPendingExec = (f) => f.status === 'planned' || f.status === 'in_progress' || f.status === 'missed'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">随访管理</h1>
          <p className="page-subtitle">共 {total} 条记录</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ 新增随访</button>
      </div>

      {/* 状态标签 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.v}
            className={`btn btn-sm ${statusTab === t.v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setStatusTab(t.v); setPage(1) }}
          >{t.l}</button>
        ))}
      </div>

      {/* 搜索栏 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>会员姓名</label>
              <input className="form-control" placeholder="输入姓名搜索" value={patientName}
                onChange={e => setPatientName(e.target.value)} style={{ width: 160 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>开始日期</label>
              <input className="form-control" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>结束日期</label>
              <input className="form-control" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">搜索</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => {
              setPatientName(''); setDateFrom(todayStr); setDateTo(''); setPage(1)
            }}>重置</button>
          </form>
        </div>
      </div>

      {/* 列表 */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : followUps.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            暂无随访记录
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>会员</th>
                <th>计划日期</th>
                <th>随访主题</th>
                <th>计划人员</th>
                <th>状态</th>
                <th>近期打卡</th>
                <th>内容摘要</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {followUps.map(f => (
                <tr key={f._id}>
                  <td>
                    <span style={{ color: '#1E6B50', cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => nav(`/patients/${f.patientId?._id}`)}>
                      {f.patientId?.name || '-'}
                    </span>
                    <div style={{ fontSize: 12, color: '#8AA89C' }}>{f.patientId?.phone}</div>
                  </td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>
                    {new Date(f.date).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>{f.theme || '-'}</td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>
                    {f.assignedTo?.name || '-'}
                  </td>
                  <td>
                    <span style={{ color: STATUS_COLOR[f.status] || '#666', fontWeight: 500, fontSize: 13 }}>
                      {STATUS_MAP[f.status] || f.status}
                    </span>
                    {f.status === 'cancelled' && f.cancelReason && (
                      <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 2 }}>{f.cancelReason}</div>
                    )}
                  </td>
                  <td>
                    {f.patientLastRecord ? (() => {
                      const days = Math.floor((Date.now() - new Date(f.patientLastRecord)) / 86400000)
                      const color = days === 0 ? '#22A06B' : days <= 3 ? '#D97706' : '#aaa'
                      const label = days === 0 ? '今日已打卡' : `${days}天前`
                      return <span style={{ fontSize: 12, color, fontWeight: days <= 1 ? 600 : 400 }}>{label}</span>
                    })() : <span style={{ fontSize: 12, color: '#ccc' }}>暂无记录</span>}
                  </td>
                  <td style={{ maxWidth: 180, fontSize: 13, color: '#4A6558' }}>
                    {f.content ? (f.content.length > 35 ? f.content.slice(0, 35) + '…' : f.content) : '-'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {isPendingExec(f) && (
                      <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }}
                        onClick={() => openExec(f)}>执行随访</button>
                    )}
                    {isPendingExec(f) && (
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                        onClick={() => openCancel(f)}>取消</button>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                      onClick={() => setDetailItem(f)}>查看详情</button>
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => nav(`/patients/${f.patientId?._id}`)}>查看会员</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', color: '#666', fontSize: 14 }}>
            第 {page} / {Math.ceil(total / limit)} 页
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {/* 随访详情弹窗 */}
      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />

      {/* 新增随访弹窗 */}
      {showModal && (
        <FollowUpModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); toast('随访计划已创建'); load() }}
        />
      )}

      {/* 执行随访弹窗 */}
      {execItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setExecItem(null) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">执行随访 · {execItem.patientId?.name}</h3>
              <button className="modal-close" onClick={() => setExecItem(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 只读信息 */}
              <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 12, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>计划日期：</span>
                  <span style={{ fontSize: 13 }}>{new Date(execItem.date).toLocaleDateString('zh-CN')}</span>
                </div>
                {execItem.theme && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>随访主题：</span>
                    <span style={{ fontSize: 13 }}>{execItem.theme}</span>
                  </div>
                )}
                {execItem.content && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>计划内容：</span>
                    <span style={{ fontSize: 13, whiteSpace: 'pre-line', flex: 1 }}>{execItem.content}</span>
                  </div>
                )}
              </div>
              {/* 填写结果 */}
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>随访方式</label>
                <select className="form-control" value={execForm.type}
                  onChange={e => setExecForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>随访结果 *</label>
                <textarea className="form-control" rows={5}
                  placeholder="记录本次随访的实际情况、会员反馈、建议等..."
                  value={execForm.content}
                  onChange={e => setExecForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 8 }}>随访结果状态</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { v: 'completed',   l: '✅ 已随访（圆满完成）' },
                    { v: 'in_progress', l: '🔄 随访中（未完成/未接通）' },
                  ].map(o => (
                    <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                      <input type="radio" name="execStatus" value={o.v}
                        checked={execForm.status === o.v}
                        onChange={() => setExecForm(f => ({ ...f, status: o.v }))} />
                      {o.l}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setExecItem(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleExec} disabled={execSaving}>
                {execSaving ? '保存中...' : '保存随访结果'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 取消随访弹窗 */}
      {cancelItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setCancelItem(null) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">取消随访</h3>
              <button className="modal-close" onClick={() => setCancelItem(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: '#4A6558', marginBottom: 12 }}>
                确认取消「{cancelItem.patientId?.name}」的随访计划？请填写取消原因。
              </p>
              <textarea className="form-control" rows={4}
                placeholder="请填写取消原因（必填）..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCancelItem(null)}>返回</button>
              <button className="btn btn-danger" onClick={handleCancel} disabled={cancelSaving}>
                {cancelSaving ? '处理中...' : '确认取消随访'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
