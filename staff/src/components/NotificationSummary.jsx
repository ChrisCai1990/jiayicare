import React, { createContext, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { staffAPI, inAppServiceGroupAPI } from '../api'
import { notificationTotal } from '../utils/staffWorkspace'

const GroupContext = createContext({ total: 0, pending: 0, supervised: 0, error: '' })
export const useGroupReminders = () => useContext(GroupContext)

const SummaryContext = createContext({ count: null, data: null, error: '' })
export const useNotificationSummary = () => useContext(SummaryContext)

export function NotificationSummaryProvider({ children, disabled = false }) {
  const location = useLocation()
  const [groups, setGroups] = useState({ total: 0, pending: 0, supervised: 0, error: '' })
  useEffect(() => {
    if (disabled) { setGroups({ total: 0, pending: 0, supervised: 0, error: '' }); return }
    let active = true, busy = false
    const refresh = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try { const result = await inAppServiceGroupAPI.reminders(); if (active) setGroups({ ...result.data, error: '' }) }
      catch (e) { if (active) setGroups(previous => ({ ...previous, error: e.message || '服务群提醒更新失败' })) }
      finally { busy = false }
    }
    refresh()
    const timer = setInterval(refresh, 5000)
    window.addEventListener('notif-refresh', refresh)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('notif-refresh', refresh); window.removeEventListener('focus', refresh) }
  }, [disabled, location.pathname])
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
  return <GroupContext.Provider value={groups}><SummaryContext.Provider value={{ ...snapshot, count: snapshot.count == null ? null : snapshot.count + groups.total }}>{children}</SummaryContext.Provider></GroupContext.Provider>
}
