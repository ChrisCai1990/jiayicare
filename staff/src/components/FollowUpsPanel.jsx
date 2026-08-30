import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import Pagination from './Pagination'
import { formatChineseDate } from '../utils/date'

const PAGE_SIZE = 5

// 客户自行完成的自动提醒不占用人工待随访队列。客户明确要求人工介入后，
// 后端会追加“人工跟进”标签，此时才重新出现在健管专员工作台。
const isCustomerSelfServiceReminder = (followUp) => {
  const tags = followUp.tags || []
  if (tags.includes('人工跟进')) return false
  if (followUp.sourceType === 'medication_reminder') return true
  if (followUp.sourceType === 'scheduled' && ((followUp.checkInItems || []).length > 0 || /^【?日常监测/.test(followUp.theme || ''))) return true
  const text = `${followUp.theme || ''} ${tags.join(' ')}`
  return tags.includes('AI自动计划') && /(用药|营养素).*提醒|提醒.*(用药|营养素)/.test(text)
}

function formatDate(date) {
  if (!date) return ''
  return formatChineseDate(date, false)
}

export default function FollowUpsPanel() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [searchName, setSearchName] = useState('')
  const [timeGroup, setTimeGroup] = useState('all')

  useEffect(() => {
    staffAPI.getFollowUps({ status: 'planned', includeFuture: '1', limit: 200 })
      .then(r => {
        // 订单来源的待办（sourceType='order'，商城下单后生成）已经在首页"待处理服务预约"面板单独展示，
        // 这里要排除掉，否则同一条记录会在"待随访任务"里重复出现——它本质是服务预约，不是随访动作
        // （2026-07-13 反馈：如"预约：医疗代诊服务"这类不该混进待随访列表）
        const followUpsOnly = (r.data?.followUps || []).filter(f => (
          f.sourceType !== 'order'
          && f.sourceType !== 'health_plan'
          && !isCustomerSelfServiceReminder(f)
        ))
        setItems(followUpsOnly)
        setTotal(followUpsOnly.length)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // 按自然日比较，不按精确时刻——此前用 date < now（精确到秒）比较，商城下单生成待办时
  // date 存的是下单那一秒的时间戳，导致下单几乎立刻就被判定"已过期"（2026-07-13 反馈）
  const isOverdue = (d) => new Date(d) < todayStart
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const weekEnd = new Date(todayStart); weekEnd.setDate(weekEnd.getDate() + 8)
  const monthEnd = new Date(todayStart); monthEnd.setDate(monthEnd.getDate() + 31)
  const bucketOf = (date) => {
    const value = new Date(date)
    if (value < todayStart) return 'overdue'
    if (value < tomorrowStart) return 'today'
    if (value < weekEnd) return 'week'
    if (value < monthEnd) return 'month'
    return 'later'
  }
  const TIME_GROUPS = [
    ['all', '全部'], ['overdue', '已逾期'], ['today', '今日'],
    ['week', '未来7天'], ['month', '未来30天'], ['later', '更晚'],
  ]
  const overdueCount = items.filter(f => isOverdue(f.date)).length
  // 按随访人员姓名本地筛选（健康顾问名下会看到多个执行人的随访，需要快速定位某人）
  const searchedItems = searchName.trim()
    ? items.filter(f => (f.assignedTo?.name || '').includes(searchName.trim()))
    : items
  const filteredItems = searchedItems
    .filter(item => timeGroup === 'all' || bucketOf(item.date) === timeGroup)
    .sort((a, b) => {
      const priority = { overdue: 0, today: 1, week: 2, month: 3, later: 4 }
      const bucketDiff = priority[bucketOf(a.date)] - priority[bucketOf(b.date)]
      if (bucketDiff) return bucketDiff
      return new Date(a.date) - new Date(b.date)
    })
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const curPage = Math.min(page, pageCount - 1)
  const pageItems = filteredItems.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="card" style={{ marginBottom: 20, border: overdueCount > 0 ? '1.5px solid #DC354540' : undefined }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="card-title">待随访任务</div>
          {items.length > 0 && (
            <span style={{
              background: overdueCount > 0 ? '#DC3545' : '#0077B6',
              color: '#fff', fontSize: 11, fontWeight: 700,
              borderRadius: 99, padding: '1px 8px', lineHeight: '18px',
            }}>{total}</span>
          )}
          {overdueCount > 0 && (
            <span style={{ fontSize: 12, color: '#DC3545', fontWeight: 500 }}>
              {overdueCount} 项已过期未随访
            </span>
          )}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => nav('/followups')}>查看全部</button>
      </div>
      <div className="card-body" style={{ padding: '4px 20px 12px' }}>
        {items.length > 0 && (
          <input
            placeholder="搜索随访人员姓名"
            value={searchName}
            onChange={e => { setSearchName(e.target.value); setPage(0) }}
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #E0D9CE', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' }}
          />
        )}
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
            {TIME_GROUPS.map(([key, label]) => {
              const count = key === 'all' ? items.length : items.filter(item => bucketOf(item.date) === key).length
              const active = timeGroup === key
              return (
                <button key={key} onClick={() => { setTimeGroup(key); setPage(0) }} style={{ border: active ? '1px solid #0077B6' : '1px solid #DDD7CD', background: active ? '#EAF5FB' : '#fff', color: active ? '#0077B6' : '#5F6B65', borderRadius: 16, padding: '5px 11px', cursor: 'pointer', fontSize: 12 }}>
                  {label} {count}
                </button>
              )
            })}
          </div>
        )}
        {items.length === 0 && (
          <div style={{ color: '#8AA89C', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            暂无待随访任务
          </div>
        )}
        {items.length > 0 && filteredItems.length === 0 && (
          <div style={{ color: '#8AA89C', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            {searchName.trim() ? '未找到该随访人员在当前时间分类中的任务' : '当前时间分类暂无任务'}
          </div>
        )}
        {pageItems.map((f, i) => {
          const overdue = isOverdue(f.date)
          return (
            <div
              key={f._id}
              onClick={() => nav(`/patients/${f.patientId?._id}?tab=followups`, { state: { openFollowUp: f } })}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                borderBottom: i < pageItems.length - 1 ? '1px solid #f0ede8' : 'none',
                cursor: 'pointer',
                background: overdue ? '#FFF8F8' : 'transparent',
                margin: overdue ? '0 -20px' : undefined,
                padding: overdue ? '10px 20px' : '10px 0',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: '#0077B615', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 16,
              }}>
                📞
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0077B6' }}>{f.theme || '随访'}</span>
                  {f.taskRole && <span style={{ fontSize: 10, color: f.taskRole === 'executor' ? '#1E6B50' : '#7C3AED', background: f.taskRole === 'executor' ? '#E8F5EF' : '#F3EEFF', padding: '1px 6px', borderRadius: 4 }}>{f.taskRole === 'executor' ? '执行任务' : '督办任务'}</span>}
                  {overdue && (
                    <span style={{ fontSize: 11, color: '#DC3545', background: '#DC354515', padding: '1px 6px', borderRadius: 4 }}>
                      已过期
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#1A2B24', marginBottom: 2 }}>
                  <span style={{ fontWeight: 500 }}>{f.patientId?.name || '未知'}</span>
                  {f.patientId?.phone && (
                    <span style={{ color: '#8AA89C', marginLeft: 8 }}>{f.patientId.phone}</span>
                  )}
                </div>
                {f.assignedTo?.name && (
                  <div style={{ fontSize: 11, color: '#8AA89C' }}>负责人：{f.assignedTo.name}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: overdue ? '#DC3545' : '#8AA89C' }}>{formatDate(f.date)}</span>
                <span style={{ fontSize: 14, color: '#C0B8AE' }}>›</span>
              </div>
            </div>
          )
        })}
        {filteredItems.length > PAGE_SIZE && (
          <Pagination compact page={curPage + 1} totalPages={pageCount} onChange={next => setPage(next - 1)} />
        )}
      </div>
    </div>
  )
}
