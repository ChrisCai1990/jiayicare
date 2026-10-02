import React, { createContext, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { staffAPI } from '../api'
import { notificationTotal } from '../utils/staffWorkspace'

const SummaryContext = createContext({ count: null, data: null, error: '' })
export const useNotificationSummary = () => useContext(SummaryContext)

export function NotificationSummaryProvider({ children, disabled = false }) {
  const location = useLocation()
  const [snapshot, setSnapshot] = useState({ count: null, data: null, error: '' })
  useEffect(() => {
    if (disabled) {
      setSnapshot({ count: 0, data: null, error: '' })
      return
    }
    let active = true
    let version = 0
    const refresh = async () => {
      const request = ++version
      try {
        const response = await staffAPI.getNotifications()
        if (active && request === version) setSnapshot({ data: response.data, count: notificationTotal(response.data?.summary), error: '' })
      } catch (error) {
        if (active && request === version) setSnapshot(previous => ({ ...previous, error: error.message || '通知加载失败' }))
      }
    }
    refresh()
    const refreshVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = setInterval(refreshVisible, 30000)
    window.addEventListener('notif-refresh', refresh)
    window.addEventListener('focus', refreshVisible)
    return () => { active = false; clearInterval(timer); window.removeEventListener('notif-refresh', refresh); window.removeEventListener('focus', refreshVisible) }
  }, [location.pathname, disabled])
  return <SummaryContext.Provider value={snapshot}>{children}</SummaryContext.Provider>
}
