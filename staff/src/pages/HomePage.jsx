import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const DISEASE_COLOR = {
  '高血压': '#e74c3c', '糖尿病': '#e67e22', '高血脂': '#f39c12',
  '冠心病': '#c0392b', '慢阻肺': '#8e44ad', '骨质疏松': '#27ae60',
}

export default function HomePage() {
  const { staff } = useStaff()
  const nav = useNavigate()
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingReferralCount, setPendingReferralCount] = useState(0)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [checkinRecords, setCheckinRecords] = useState([])

  useEffect(() => {
    staffAPI.getReports()
      .then(r => setReports(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))

    staffAPI.getCheckinOverview({})
      .then(r => setCheckinRecords(r.data || []))
      .catch(() => {})

    Promise.allSettled([
      staffAPI.getNotifications(),
      staffAPI.getUserMessages(),
    ]).then(([notifRes, msgRes]) => {
      if (notifRes.status === 'fulfilled') {
        const s = notifRes.value.data?.summary || {}
        setPendingReferralCount((s.pendingReferralCount || 0) + (s.unreadRepliedCount || 0))
      }
      if (msgRes.status === 'fulfilled') {
        setUnreadMsgCount(msgRes.value.unreadCount ?? msgRes.value.data?.filter(m => m.staffUnread)?.length ?? 0)
      }
    })
  }, [])

  if (loading) return <div className="page-loading">加载中...</div>

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

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

      {/* 数据卡片 */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <StatCard icon="👥" label="我的会员" value={reports?.totalPatients ?? '-'} color="#1E6B50" onClick={() => nav('/patients')} />
        <StatCard icon="📞" label="今日随访" value={reports?.todayFollowUps ?? '-'} color="#0077B6" onClick={() => nav('/followups')} />
        <StatCard icon="📅" label="本月随访" value={reports?.monthFollowUps ?? '-'} color="#22A06B" onClick={() => nav('/followups')} />
        <StatCard icon="✅" label="今日打卡" value={checkinRecords.length} color="#D97706" onClick={() => nav('/daily-checkin')} />
      </div>

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
                  onClick={() => nav(`/patients/${r.patientId}?tab=records`)}>
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
                    {r.missingItems.length > 0 && (
                      <span style={{ fontSize: 12, color: '#D97706', background: '#D9780618', padding: '2px 8px', borderRadius: 99 }}>
                        未完成 {r.missingItems.length} 项
                      </span>
                    )}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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

        {/* 快速入口 */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">快速操作</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { icon: '➕', label: '新增会员', path: '/patients/new', badge: 0 },
                { icon: '🔔', label: '消息通知', path: '/notifications', badge: pendingReferralCount + unreadMsgCount },
                { icon: '🛍', label: '产品推送', path: '/products', badge: 0 },
              ].map(item => (
                <button
                  key={item.label}
                  className="quick-btn"
                  onClick={() => nav(item.path)}
                  style={{
                    padding: '16px 12px', borderRadius: 12,
                    border: item.badge > 0 ? '1.5px solid #D97706' : '1px solid #E0D9CE',
                    background: item.badge > 0 ? '#FFFBF5' : '#f9f7f3',
                    cursor: 'pointer', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    fontSize: 13, color: '#1A2B24', transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  {item.badge > 0 && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8,
                      background: '#DC3545', color: '#fff',
                      borderRadius: 99, fontSize: 11, fontWeight: 700,
                      minWidth: 18, height: 18, lineHeight: '18px',
                      textAlign: 'center', padding: '0 4px',
                    }}>{item.badge}</span>
                  )}
                  <span style={{ fontSize: 24 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color, onClick }) {
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
        <div className="stat-card-value" style={{ color }}>{value}</div>
        <div className="stat-card-label">{label}</div>
      </div>
    </div>
  )
}
