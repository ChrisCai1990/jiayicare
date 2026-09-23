import React from 'react'
import { useToast } from '../App'
import { VisitorLeadsTab } from './MarketingPage'

export default function VisitorLeadsPage() {
  const toast = useToast()
  return <div className="page">
    <div className="page-header">
      <div>
        <h1 className="page-title">官网咨询线索</h1>
        <p className="page-subtitle">访客主动提交的非医疗健康管理咨询，由健康规划师接单并跟进。</p>
      </div>
    </div>
    <VisitorLeadsTab toast={toast} />
  </div>
}
