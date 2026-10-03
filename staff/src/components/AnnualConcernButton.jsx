import React, { useState } from 'react'
import { staffAPI } from '../api'

export default function AnnualConcernButton({ patientId, year, source, staff, toast }) {
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)
  if (!['familyDoctor', 'superadmin'].includes(staff?.role) || !source) return null
  const add = async event => {
    event.stopPropagation()
    setBusy(true)
    try {
      const prepared = await staffAPI.prepareAnnualComprehensiveReview(patientId, year)
      const result = await staffAPI.addAiCaseReviewConcern(patientId, prepared.data._id, source)
      setAdded(true)
      toast(result.reused ? '该来源已在年度研判中' : '已纳入年度待研判问题')
    } catch (error) { toast(error.message || '纳入关注失败', 'error') }
    finally { setBusy(false) }
  }
  return <button type="button" className="btn btn-secondary btn-sm" disabled={busy || added} onClick={add}
    title={`纳入${year}年度重大疾病筛查维度分析，稍后核对证据并决定去向`}>{added ? '已纳入年度分析' : busy ? '纳入中…' : '＋ 纳入年度分析'}</button>
}
