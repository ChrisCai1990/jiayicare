import useWorkbenchResource from '../hooks/useWorkbenchResource'
import { getToken } from '../api'
import { loadFollowUpPages } from '../utils/loadFollowUpPages.mjs'
import AiWorkbenchProvider from '../components/AiWorkbenchProvider'
import ConsultationTodosPanel from '../components/ConsultationTodosPanel'
import OrderShipmentsPanel from '../components/OrderShipmentsPanel'
import orderShipping from '../../../shared/orderShipping.cjs'
import { useNotificationSummary } from '../components/NotificationSummary'
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import AiTodosPanel from '../components/AiTodosPanel'
import SymptomTodosPanel from '../components/SymptomTodosPanel'
import FollowUpsPanel from '../components/FollowUpsPanel'
import ServiceTasksPanel from '../components/ServiceTasksPanel'
import MonthlyReviewWorkbench from '../components/MonthlyReviewWorkbench'
import Pagination from '../components/Pagination'
import { isCustomerOrder, plannerOrderRows } from '../utils/plannerOrderProgress.mjs'

const ORDERS_PER_PAGE = 5

const DISEASE_COLOR = {
  '高血压': '#e74c3c', '糖尿病': '#e67e22', '高血脂': '#f39c12',
  '冠心病': '#c0392b', '慢阻肺': '#8e44ad', '骨质疏松': '#27ae60',
}

export default function HomePage() {
  const { staff } = useStaff()
  const nav = useNavigate()
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const notification = useNotificationSummary()
  const unreadMsgCount = notification.count ?? '—'
  const [checkinRecords, setCheckinRecords] = useState([])
  const [checkupProgress, setCheckupProgress] = useState([])
  const expiringPatients = notification.data?.expiringPatients || []
  const ordersResource = useWorkbenchResource(async () => {
    const [pending, completed] = await Promise.all([
      loadFollowUpPages(staffAPI.getFollowUps, { status: 'active', sourceType: 'order', scope: 'assigned', includeFuture: '1' }),
      loadFollowUpPages(staffAPI.getFollowUps, { status: 'completed', sourceType: 'order', scope: 'assigned' }),
    ])
    return { pending, completed }
  }, getToken(), { pending: [], completed: [] })
  const pendingOrders = ordersResource.data.pending
  const completedOrders = ordersResource.data.completed
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false)
  const [orderPage, setOrderPage] = useState(1)
  const [orderHistoryPage, setOrderHistoryPage] = useState(1)
  const [serviceTasks, setServiceTasks] = useState([])

  useEffect(() => {
    staffAPI.getReports2()
      .then(r => setReports(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))

    staffAPI.getCheckinOverview({})
      .then(r => setCheckinRecords(r.data || []))
      .catch(() => {})

    staffAPI.getCheckupProgress()
      .then(r => setCheckupProgress(r.data || []))
      .catch(() => {})

  }, [])

  if (loading) return <div className="page-loading">加载中...</div>

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const now = new Date()
  const todayKey = dateKey(now)
  const monthStartKey = dateKey(new Date(now.getFullYear(), now.getMonth(), 1))
  const monthEndKey = dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const yesterdayKey = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const followUpUrl = ({ status, dateFrom = '', dateTo = '', dateField = 'date' }) => {
    const query = new URLSearchParams({ status, dateFrom, dateTo, dateField })
    return `/followups?${query}`
  }
  const orderRows = plannerOrderRows(pendingOrders, serviceTasks)
  const orderHistoryRows = [...new Map(completedOrders
    .filter(item => isCustomerOrder(item.sourceOrderId, item))
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
    .map(item => [String(item.sourceOrderId?._id || item._id), item])).values()]
  const orderPageCount = Math.max(1, Math.ceil(orderRows.length / ORDERS_PER_PAGE))
  const currentOrderPage = Math.min(orderPage, orderPageCount)
  const visibleOrderRows = orderRows.slice((currentOrderPage - 1) * ORDERS_PER_PAGE, currentOrderPage * ORDERS_PER_PAGE)
  const orderHistoryPageCount = Math.max(1, Math.ceil(orderHistoryRows.length / ORDERS_PER_PAGE))
  const currentOrderHistoryPage = Math.min(orderHistoryPage, orderHistoryPageCount)
  const visibleOrderHistoryRows = orderHistoryRows.slice((currentOrderHistoryPage - 1) * ORDERS_PER_PAGE, currentOrderHistoryPage * ORDERS_PER_PAGE)

  return (
    <div className="page">
      {/* 问候语 */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">你好，{staff?.name} {staff?.roleLabel && `· ${staff.roleLabel}`}</h1>
          <p className="page-subtitle">{today}</p>
        </div>
        <button className="btn btn-primary" onClick={() => nav('/patients/new')}>
          ＋ 新增会员
        </button>
      </div>

      <AiWorkbenchProvider>
      <SymptomTodosPanel />
      {['healthPlanner', 'superadmin'].includes(staff?.role) && <ConsultationTodosPanel />}
      {['healthManager', 'healthPlanner', 'superadmin'].includes(staff?.role) && <OrderShipmentsPanel />}

      {/* 用户端购买的服务单独展示；医护端发起的服务只在下方任务区出现。 */}
      {(ordersResource.loading || ordersResource.error || orderRows.length > 0 || orderHistoryRows.length > 0) && (
        <div className="card" style={{ marginBottom: 20, border: '1.5px solid #22A06B40' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🛍 用户下单服务进程</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#22A06B', background: '#22A06B18', padding: '2px 8px', borderRadius: 99 }}>{orderRows.length}</span>
            </div>
            {orderHistoryRows.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOrderHistoryOpen(value => !value)}>{orderHistoryOpen ? '收起已处理预约' : `查看已处理预约 ${orderHistoryRows.length}`}</button>}
          </div>
          <div className="card-body" style={{ padding: '8px 20px' }}>
            {ordersResource.loading && <div role="status">正在加载服务预约…</div>}
            {ordersResource.error && <div role="alert" style={{ color: '#B42318', padding: 12 }}>服务预约未完整加载：{ordersResource.error} <button onClick={ordersResource.refresh}>重试</button></div>}
            {visibleOrderRows.map(({ id, pending: f, supervisor, task: serviceTask, action }, i) => {
              const task = supervisor || serviceTask
              const order = task?.sourceOrderId || f?.sourceOrderId
              const openTarget = action || (supervisor && !/专家约诊/.test(supervisor.theme || '') ? supervisor : null) || (!task ? f : null)
              return <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < visibleOrderRows.length - 1 ? '1px solid #f0ede8' : 'none', cursor: openTarget ? 'pointer' : 'default' }} onClick={() => { if (openTarget) nav(`/patients/${openTarget.patientId?._id}?tab=followups`, { state: { openFollowUp: openTarget } }) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24', minWidth: 60, flexShrink: 0 }}>{(task || f)?.patientId?.name || '未知'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#1A2B24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order?.serviceName || f?.theme || task?.theme}{order && <span style={{ color: '#D97706', marginLeft: 8 }}>支付 ¥{(Number(order.paidAmount || 0) + Number(order.healthFundAmount || 0)).toFixed(2)}</span>}</div>
                    {(order?.scheduledAt || order?.note || f?.content) && <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order?.scheduledAt && `预约时间：${new Date(order.scheduledAt).toLocaleString('zh-CN')} · `}备注：{order?.note || f?.content || '未填写，请联系客户确认时间'}</div>}
                    <div style={{ fontSize: 12, color: '#1E6B50', marginTop: 5 }}>
                      {task ? (supervisor?.supervisionProgress?.current?.length
                        ? supervisor.supervisionProgress.current.map(step => <div key={step.id}>当前环节：{step.label} · 处理人：{step.assignee}{step.blocked ? ' · 等待前置环节' : ''}</div>)
                        : task.supervisionProgress?.message || `当前环节：${task.theme || '待核对'} · 处理人：${task.assignedTo?.name || '待分配'}`)
                        : orderShipping.shippingProgress(order) || '待健康规划师确认客户需求并转交下一环节'}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: '#aaa', flexShrink: 0, marginLeft: 12 }}>{action ? '待我办理' : task ? '流程进行中' : `下单 ${new Date(order?.createdAt || f.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}</span>
              </div>
            })}
            {orderRows.length > ORDERS_PER_PAGE && <nav aria-label="用户下单服务进程分页" style={{ paddingBottom: 8 }}>
              <Pagination compact page={currentOrderPage} totalPages={orderPageCount} onChange={setOrderPage} />
            </nav>}
            {orderHistoryOpen && <div style={{ borderTop: '1px solid #E3ECE7', marginTop: 8, paddingTop: 10 }}>
              <div style={{ fontWeight: 600, color: '#52685D', marginBottom: 6 }}>过往已处理预约（不代表服务已结束）</div>
              {visibleOrderHistoryRows.map(item => <div key={item._id} onClick={() => nav(`/patients/${item.patientId?._id}?tab=followups`)} style={{ padding: '9px 0', borderBottom: '1px solid #F0EDE8', cursor: 'pointer' }}>
                <b>{item.patientId?.name || '未知客户'}</b> · {item.sourceOrderId?.serviceName || item.theme} · {item.completedAt ? new Date(item.completedAt).toLocaleString('zh-CN') : '已处理'}
                <div style={{ color: '#667085', fontSize: 12, whiteSpace: 'pre-wrap' }}>{item.executedContent || item.content || '点击查看客户服务档案'}</div>
              </div>)}
              {orderHistoryRows.length > ORDERS_PER_PAGE && <nav aria-label="已处理预约分页" style={{ paddingBottom: 8 }}>
                <Pagination compact page={currentOrderHistoryPage} totalPages={orderHistoryPageCount} onChange={setOrderHistoryPage} />
              </nav>}
            </div>}
          </div>
        </div>
      )}

      {/* 临时服务方案产生的岗位任务优先处理，固定显示在 AI 审核任务上方。 */}
      <MonthlyReviewWorkbench />
      <ServiceTasksPanel onTasksLoaded={setServiceTasks} />

      {/* AI 待审核任务面板 */}
      <AiTodosPanel />

      {/* 待随访任务面板 */}
      <FollowUpsPanel />
      </AiWorkbenchProvider>

      {/* 数据卡片 */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 24 }}>
        <StatCard icon="📞" label="今日随访" value={reports?.today ? <FollowUpStatValue {...reports.today}
          onPending={() => nav(followUpUrl({ status: 'active', dateFrom: todayKey, dateTo: todayKey }))}
          onCompleted={() => nav(followUpUrl({ status: 'completed', dateFrom: todayKey, dateTo: todayKey, dateField: 'completedAt' }))} /> : '-'} color="#0077B6" compact />
        <StatCard icon="📅" label="本月随访" value={reports?.month ? <FollowUpStatValue {...reports.month}
          onPending={() => nav(followUpUrl({ status: 'active', dateFrom: monthStartKey, dateTo: monthEndKey }))}
          onCompleted={() => nav(followUpUrl({ status: 'completed', dateFrom: monthStartKey, dateTo: monthEndKey, dateField: 'completedAt' }))} /> : '-'} color="#22A06B" compact />
        <StatCard icon="⏰" label="逾期随访" value={reports?.overdue ?? '-'} color="#DC3545" onClick={() => nav(followUpUrl({ status: 'active', dateTo: yesterdayKey }))} />
        <StatCard icon="✅" label="今日健康监测" value={checkinRecords.length} color="#D97706" onClick={() => nav('/daily-checkin')} />
        <StatCard icon="🔔" label="消息通知" value={unreadMsgCount} color="#DC3545" onClick={() => nav('/notifications')} />
        {notification.error && <span role="alert" style={{ color: '#B42318', fontSize: 12 }}>通知更新失败，显示上次结果 <button onClick={() => window.dispatchEvent(new Event('notif-refresh'))}>重试</button></span>}
      </div>

      {/* 即将到期客户（30天内，提前一月提醒续约） */}
      {expiringPatients.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⏰ 即将到期客户</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#DC3545', background: '#DC354518', padding: '2px 8px', borderRadius: 99 }}>
                {expiringPatients.length}
              </span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => nav('/notifications')}>查看全部</button>
          </div>
          <div className="card-body" style={{ padding: '8px 20px' }}>
            {expiringPatients.slice(0, 5).map((p, i) => {
              const daysLeft = Math.ceil((new Date(p.serviceExpiry) - new Date()) / 86400000)
              return (
                <div key={p._id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: i < Math.min(expiringPatients.length, 5) - 1 ? '1px solid #f0ede8' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => nav(`/patients/${p._id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24', minWidth: 60 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C' }}>{p.phone}</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>{p.servicePackage}</span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                    color: daysLeft <= 7 ? '#DC3545' : '#D97706',
                    background: daysLeft <= 7 ? '#DC354518' : '#D9780618',
                  }}>
                    {daysLeft} 天后到期
                  </span>
                </div>
              )
            })}
            {expiringPatients.length > 5 && (
              <div style={{ textAlign: 'center', padding: '10px 0 2px', fontSize: 13, color: '#8AA89C', cursor: 'pointer' }}
                onClick={() => nav('/notifications')}>
                还有 {expiringPatients.length - 5} 位客户 →
              </div>
            )}
          </div>
        </div>
      )}

      {/* 今日健康打卡 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="card-title">今日健康打卡</div>
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/daily-checkin')}>查看全部</button>
        </div>
        <div className="card-body" style={{ padding: checkinRecords.length === 0 ? '20px 20px' : '8px 20px' }}>
          {checkinRecords.length === 0 ? (
            <div style={{ color: '#aaa', textAlign: 'center', fontSize: 14 }}>今日暂无客户打卡</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {checkinRecords.slice(0, 5).map((r, i) => (
                <div key={String(r.patientId)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: i < Math.min(checkinRecords.length, 5) - 1 ? '1px solid #f0ede8' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => nav(`/patients/${r.patientId}?tab=monitoring`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24', minWidth: 60 }}>{r.patientName}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C' }}>{r.patientPhone}</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>
                      {new Date(r.latestRecordAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#22A06B', background: '#22A06B18', padding: '2px 8px', borderRadius: 99 }}>
                      已打 {r.doneItems.length} 项
                    </span>
                  </div>
                </div>
              ))}
              {checkinRecords.length > 5 && (
                <div style={{ textAlign: 'center', padding: '10px 0 2px', fontSize: 13, color: '#8AA89C', cursor: 'pointer' }}
                  onClick={() => nav('/daily-checkin')}>
                  还有 {checkinRecords.length - 5} 位客户 →
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 体检方案回传进度：避免逐个客户查询漏检 */}
      {checkupProgress.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="card-title">体检方案待完成（{checkupProgress.length}位客户）</div>
          </div>
          <div className="card-body" style={{ padding: '8px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {checkupProgress.slice(0, 5).map((r, i) => (
                <div key={String(r.planId)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: i < Math.min(checkupProgress.length, 5) - 1 ? '1px solid #f0ede8' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => nav(`/plans/${r.planId}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24', minWidth: 60 }}>{r.patientName}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C' }}>{r.patientPhone}</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>{r.planTitle}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#D97706', background: '#D9780618', padding: '2px 8px', borderRadius: 99 }}>
                    待完成 {r.pendingCount}/{r.totalItems} 项
                  </span>
                </div>
              ))}
              {checkupProgress.length > 5 && (
                <div style={{ textAlign: 'center', padding: '10px 0 2px', fontSize: 13, color: '#8AA89C' }}>
                  还有 {checkupProgress.length - 5} 位客户待跟进
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 慢病分布 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">慢病分布</div>
        </div>
        <div className="card-body">
          {reports?.diseaseDistribution?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reports.diseaseDistribution.map(d => (
                <div key={d.disease} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    background: DISEASE_COLOR[d.disease] || '#8AA89C',
                    color: '#fff', padding: '2px 10px', borderRadius: 99, fontSize: 12, minWidth: 60, textAlign: 'center'
                  }}>{d.disease}</span>
                  <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 4 }}>
                    <div style={{
                      width: `${Math.min(100, (d.count / (reports.totalPatients || 1)) * 100)}%`,
                      height: '100%',
                      background: DISEASE_COLOR[d.disease] || '#1E6B50',
                      borderRadius: 4,
                    }} />
                  </div>
                  <span style={{ fontSize: 13, color: '#666', minWidth: 30, textAlign: 'right' }}>{d.count}人</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#aaa', textAlign: 'center', padding: '20px 0', fontSize: 14 }}>暂无慢病数据</div>
          )}
        </div>
      </div>
    </div>
  )
}

function FollowUpStatValue({ pending, completed, onPending, onCompleted }) {
  return (
    <span className="followup-stat-value">
      <button type="button" className="followup-stat-link" onClick={onPending} title="查看待随访计划">
        <span className="followup-stat-label">待</span>
        <strong>{pending}</strong>
      </button>
      <span className="followup-stat-separator">·</span>
      <button type="button" className="followup-stat-link" onClick={onCompleted} title="查看已完成随访">
        <span className="followup-stat-label">已</span>
        <strong>{completed}</strong>
      </button>
    </span>
  )
}

function StatCard({ icon, label, value, color, compact = false, onClick }) {
  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="stat-card-icon" style={{ background: color + '15', color }}>
        {icon}
      </div>
      <div>
        <div className={`stat-card-value${compact ? ' stat-card-value-compact' : ''}`} style={{ color }}>{value}</div>
        <div className="stat-card-label">{label}</div>
      </div>
    </div>
  )
}
