import React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStaff } from '../App'
import ReportFollowUpDrafts from '../components/ReportFollowUpDrafts'

export default function SingleReportFollowUpPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const { staff } = useStaff()
  const canEdit = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const year = Number(searchParams.get('year')) || new Date().getFullYear()

  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
    <button type="button" className="btn btn-secondary" onClick={() => nav('/home')} style={{ marginBottom: 18 }}>返回工作台</button>
    <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>单次随访方案</h1>
    <p style={{ color: '#61746a', margin: '0 0 24px' }}>核对本次就医或检查资料，确认本次随访安排。</p>
    <ReportFollowUpDrafts patientId={id} year={year} canEdit={canEdit} singleOnly />
  </main>
}
