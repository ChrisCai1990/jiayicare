import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import OpsDashboardView from '../../components/OpsDashboardView'

const API_ROOT = import.meta.env.VITE_API_URL || 'http://121.40.156.39/api'
const REFRESH_INTERVAL_MS = 60 * 1000
const STORAGE_KEY_PREFIX = 'jy_ops_public_passcode_'

// 对外展示：长随机链接(slug) + 简单口令，非账号登录。同一浏览器验证过口令后本地记住，
// 避免每次刷新都要重新输入——但每次拉数据仍会带口令去后端校验，口令改了会立即失效。
export default function PublicOpsDashboardPage() {
  const { slug } = useParams()
  const storageKey = STORAGE_KEY_PREFIX + slug
  const [passcode, setPasscode] = useState(() => localStorage.getItem(storageKey) || '')
  const [inputPasscode, setInputPasscode] = useState('')
  const [verified, setVerified] = useState(false)
  const [data, setData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async (pc) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_ROOT}/ops-dashboard/public/${slug}/data?passcode=${encodeURIComponent(pc)}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || '加载失败')
      setData(json.data)
      setLastUpdated(new Date())
      setVerified(true)
      localStorage.setItem(storageKey, pc)
    } catch (err) {
      setError(err.message)
      setVerified(false)
      localStorage.removeItem(storageKey)
    } finally {
      setLoading(false)
    }
  }, [slug, storageKey])

  useEffect(() => {
    if (passcode) fetchData(passcode)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!verified) return
    const timer = setInterval(() => fetchData(passcode), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [verified, passcode, fetchData])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!inputPasscode.trim()) return
    fetchData(inputPasscode.trim())
  }

  if (!verified) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F2EDE3' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '40px 36px', width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 4, color: '#1A2B24' }}>运营数据展示</div>
          <div style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 24 }}>请输入访问口令</div>
          {error && <div style={{ background: '#fee', color: '#c00', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <input
              className="form-input"
              type="password"
              value={inputPasscode}
              onChange={e => setInputPasscode(e.target.value)}
              placeholder="访问口令"
              style={{ width: '100%', marginBottom: 16, textAlign: 'center', fontSize: 16 }}
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? '验证中...' : '进入看板'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F2EDE3', padding: '32px 40px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1A2B24' }}>📊 嘉医管家 · 运营数据总览</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>数据每 60 秒自动刷新</div>
          </div>
        </div>
        {data && <OpsDashboardView data={data} lastUpdated={lastUpdated} />}
      </div>
    </div>
  )
}
