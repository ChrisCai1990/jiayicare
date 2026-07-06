import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

const TYPE_COLOR = {
  bloodPressure: '#DC3545', bloodSugar: '#D97706', weight: '#1E6B50',
  heartRate: '#7C3AED', sleep: '#4F46E5', diet: '#B45309',
  exercise: '#0369A1', water: '#0EA5E9', bowel: '#92400E',
  smoking: '#6B7280', alcohol: '#9D174D', mood: '#059669',
}

export default function DailyCheckinPage() {
  const nav = useNavigate()
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')

  const todayStr = new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (dateFilter) params.date = dateFilter
      if (nameFilter) params.patientName = nameFilter
      const res = await staffAPI.getCheckinOverview(params)
      setRecords(res.data || [])
      setTotal(res.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [dateFilter, nameFilter])

  useEffect(() => { load() }, [load])

  const fmtTime = t => {
    if (!t) return '-'
    return new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">日常健康打卡</h1>
          <p className="page-subtitle">
            {dateFilter
              ? `${dateFilter} 共 ${total} 位客户有打卡记录`
              : `今日（${todayStr}）共 ${total} 位客户有打卡记录`}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>刷新</button>
      </div>

      {/* 搜索栏 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>客户姓名</label>
              <input className="form-control" placeholder="输入姓名搜索" value={nameFilter}
                onChange={e => setNameFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load()}
                style={{ width: 160 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>按日期筛选</label>
              <input className="form-control" type="date" value={dateFilter}
                onChange={e => setDateFilter(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={load}>搜索</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setDateFilter(''); setNameFilter('') }}>重置</button>
          </div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>加载中...</div>
      ) : records.length === 0 ? (
        <div className="card">
          <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>
            {dateFilter ? `${dateFilter} 暂无打卡记录` : '今日暂无客户打卡'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {records.map(r => (
            <div key={String(r.patientId)} className="card"
              style={{ cursor: 'pointer', transition: 'box-shadow .15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(30,107,80,.12)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
              onClick={() => nav(`/patients/${r.patientId}?tab=records`)}>
              <div className="card-body" style={{ padding: '14px 20px' }}>
                {/* 顶部：姓名 + 电话 + 时间 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1A2B24' }}>{r.patientName}</span>
                    <span style={{ fontSize: 13, color: '#8AA89C' }}>{r.patientPhone}</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>最近打卡 {fmtTime(r.latestRecordAt)}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm"
                    onClick={e => { e.stopPropagation(); nav(`/patients/${r.patientId}?tab=records`) }}>
                    查看档案
                  </button>
                </div>

                {/* 已打卡 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: r.missingItems.length ? 8 : 0 }}>
                  {r.doneItems.map((item, idx) => (
                    <span key={`${item.type}-${item.recordedAt || idx}`} style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      background: (TYPE_COLOR[item.type] || '#1E6B50') + '18',
                      color: TYPE_COLOR[item.type] || '#1E6B50',
                      border: `1px solid ${TYPE_COLOR[item.type] || '#1E6B50'}30`,
                    }}>
                      ✓ {item.label}{item.value ? `：${item.value}${item.unit}` : ''}
                    </span>
                  ))}
                </div>

                {/* 未打卡 */}
                {r.missingItems.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>未完成：</span>
                    {r.missingItems.map(item => (
                      <span key={item.type} style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: 11,
                        background: '#f5f2ec', color: '#aaa', border: '1px solid #E0D9CE',
                      }}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
