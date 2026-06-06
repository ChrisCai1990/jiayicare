import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

const TYPE_LABEL = {
  bloodPressure: '血压', bloodSugar: '血糖', weight: '体重', heartRate: '心率',
  sleep: '睡眠', mood: '情绪', diet: '饮食', exercise: '运动', water: '饮水',
}
const TYPE_COLOR = {
  bloodPressure: '#DC3545', bloodSugar: '#D97706', weight: '#1E6B50',
  heartRate: '#7C3AED', sleep: '#4F46E5', mood: '#059669',
  diet: '#B45309', exercise: '#0369A1', water: '#0077B6',
}

export default function DailyCheckinPage() {
  const nav = useNavigate()
  const [records, setRecords]     = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')

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

  const handleSearch = e => { e.preventDefault(); load() }
  const handleReset  = () => { setDateFilter(''); setNameFilter('') }

  const fmtTime = (t) => {
    if (!t) return '-'
    const d = new Date(t)
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">日常健康打卡</h1>
          <p className="page-subtitle">共 {total} 位客户有打卡记录</p>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>客户姓名</label>
              <input className="form-control" placeholder="输入姓名搜索" value={nameFilter}
                onChange={e => setNameFilter(e.target.value)} style={{ width: 160 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>按日期筛选</label>
              <input className="form-control" type="date" value={dateFilter}
                onChange={e => setDateFilter(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">搜索</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={handleReset}>重置</button>
          </form>
        </div>
      </div>

      {/* 列表 */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : records.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无打卡记录</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>客户姓名</th>
                <th>手机号</th>
                <th>最近打卡时间</th>
                <th>打卡项目概要</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={String(r.patientId)} style={{ cursor: 'pointer' }}
                  onClick={() => nav(`/patients/${r.patientId}`)}>
                  <td><strong>{r.patientName}</strong></td>
                  <td style={{ color: '#8AA89C', fontSize: 13 }}>{r.patientPhone}</td>
                  <td style={{ color: '#8AA89C', fontSize: 13 }}>{fmtTime(r.latestRecordAt)}</td>
                  <td>
                    <span style={{
                      fontSize: 13, fontWeight: 500,
                      color: TYPE_COLOR[r.type] || '#1A2B24',
                      background: (TYPE_COLOR[r.type] || '#1A2B24') + '18',
                      padding: '2px 10px', borderRadius: 99,
                    }}>
                      {TYPE_LABEL[r.type] || r.type} {r.value}{r.unit || ''}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm"
                      onClick={e => { e.stopPropagation(); nav(`/patients/${r.patientId}`) }}>
                      查看档案
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
