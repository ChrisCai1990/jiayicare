import React, { useEffect, useState, useCallback } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'
import OpsDashboardView from '../components/OpsDashboardView'

const REFRESH_INTERVAL_MS = 60 * 1000 // 每60秒自动刷新，大屏展示场景

export default function OpsDashboardPage() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.opsDashboardInternal()
      setData(res.data)
      setLastUpdated(new Date())
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [autoRefresh, load])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📊 运营看板</div>
          <div className="page-subtitle">跨企业+全量客户的整体运营数据总览</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setAutoRefresh(v => !v)}>
            {autoRefresh ? '⏸ 暂停自动刷新' : '▶ 开启自动刷新'}
          </button>
          <button className="btn btn-primary" onClick={load}>🔄 立即刷新</button>
        </div>
      </div>

      {loading ? <div className="loading">加载中...</div> : <OpsDashboardView data={data} lastUpdated={lastUpdated} />}
    </div>
  )
}
