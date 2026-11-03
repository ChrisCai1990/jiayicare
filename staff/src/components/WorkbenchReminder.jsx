import React, { createContext, useContext, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useStaff } from '../App'
import { staffAPI, getToken } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'
import { useAiWorkbench } from './AiWorkbenchProvider'
import { canShowGeoReview } from './GeoReviewPanel'
import { groupServiceTasks, isServiceActionable, isNutritionActionable, mergeReminderResults, reminderState } from '../utils/workbenchReminder.mjs'
import { isCustomerOrder } from '../utils/plannerOrderProgress.mjs'
import { loadFollowUpPages } from '../utils/loadFollowUpPages.mjs'

const Context = createContext({ pending: false, error: false, loading: true })
export const useWorkbenchReminder = () => useContext(Context)
const data = async request => (await request).data
const hasRows = async request => {
  const rows = await data(request)
  if (!Array.isArray(rows)) throw new Error('待办返回格式异常')
  return rows.length > 0
}

export default function WorkbenchReminder({ children, disabled = false }) {
  const { staff } = useStaff()
  const location = useLocation()
  const ai = useAiWorkbench()
  const previous = useRef({})
  const resource = useWorkbenchResource(async () => {
    const role = staff?.role
    const entries = [
      ['followup', async () => {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const result = await data(staffAPI.getFollowUps({ status: 'active', includeFuture: '1', workbench: 'human', page: 1, limit: 1, workbenchTime: 'all', dayStart: today.toISOString() }))
        return result.workbenchSummary?.counts?.all > 0
      }],
      ['service', async () => groupServiceTasks((await data(staffAPI.getServiceTasks({ status: 'active', includeFuture: '1', limit: 100 })) || [])
        .filter(task => task.taskRole === 'supervisor' || task.serviceTracking?.status !== 'waiting')).some(service => isServiceActionable(service))],
      ['monthly', async () => {
        const result = await data(staffAPI.getMonthlyReviewWorkbench())
        return result?.pending?.length > 0 || result?.actions?.length > 0
      }],
      ['coordination', async () => {
        const result = await data(staffAPI.getServiceSupervision())
        return result?.inbox?.length > 0 || result?.services?.some(row => !!row.actionTaskId)
      }],
    ]
    if (['familyDoctor', 'healthPlanner', 'healthManager', 'medicalAssistant', 'superadmin'].includes(role)) entries.push(['orders', async () =>
      (await loadFollowUpPages(staffAPI.getFollowUps, { status: 'active', sourceType: 'order', scope: 'assigned', includeFuture: '1' })).some(row => isCustomerOrder(row.sourceOrderId, row))])
    if (role === 'familyDoctor') entries.push(['standards', () => hasRows(staffAPI.clinicalStandardUpdates())])
    if (['healthManager', 'superadmin'].includes(role)) {
      entries.push(['inventory', () => hasRows(staffAPI.inventoryDispatches('pending'))])
      entries.push(['checkup', async () => (await data(staffAPI.getCheckupProgress({ includeCompleted: '1' })))?.some(row => row.pendingCount > 0 && row.workStage !== 'waiting_exam')])
    }
    if (['healthPlanner', 'superadmin'].includes(role)) entries.push(['consultation', () => hasRows(staffAPI.getConsultationTodos())])
    if (['healthManager', 'healthPlanner', 'superadmin'].includes(role)) entries.push(['shipments', () => hasRows(staffAPI.getOrderShipments())])
    if (['healthManager', 'healthPlanner', 'nutritionist', 'superadmin'].includes(role)) entries.push(['nutrition', async () =>
      (await data(staffAPI.getNutritionAssessments({})))?.some(row => isNutritionActionable(row, role) && !(row.status === 'booked' && row.executionFollowUpId))])
    if (canShowGeoReview(staff)) entries.push(['geo', async () => (await data(staffAPI.getContentReviews()))?.some(row => row.status === 'pending' && (role === 'superadmin' || row.currentRole === role))])
    const results = await Promise.allSettled(entries.map(([, load]) => load()))
    previous.current = mergeReminderResults(previous.current, entries, results)
    return previous.current
  }, getToken(), {}, !disabled)
  useEffect(() => { if (!disabled) { resource.refresh(); ai.refresh() } }, [location.pathname, location.search, disabled])
  const state = reminderState(resource.data)
  const pending = state.pending || ai.data.some(row => (staff?.role === 'superadmin' || row.type !== 'assignment_attention') && !(canShowGeoReview(staff) && row.type === 'geo_content_review'))
  return <Context.Provider value={{ pending: !disabled && pending, error: !disabled && (state.error || !!resource.error || !!ai.error), loading: !disabled && (resource.loading || ai.loading), refresh: () => { resource.refresh(); ai.refresh() } }}>{children}</Context.Provider>
}
