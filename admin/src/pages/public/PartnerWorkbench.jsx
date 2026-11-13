import React from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdmin } from '../../App'

const sections = [
  ['/partner-workbench/overview', '团队与人员'],
  ['/partner-workbench/business-accounting', '经营与分账'],
  ['/partner-workbench/operations', '业务登记'],
  ['/partner-workbench/finance', '财务审核'],
  ['/partner-workbench/team-earnings', '负责人逐笔核对'],
]

export default function PartnerWorkbench() {
  const { admin } = useAdmin()
  const location = useLocation()
  if (admin?.role !== 'superadmin') return <Navigate to="/dashboard" replace />
  return <div style={{ minHeight: '100vh', background: '#f4f6f7', padding: '24px 18px' }}>
    <header style={{ maxWidth: 1280, margin: '0 auto 20px' }}>
      <h1 style={{ margin: '0 0 8px' }}>嘉医汇业务工作台</h1>
      <p style={{ color: '#667a6d', margin: '0 0 14px' }}>机构超级管理员查看全员业务并处理登记与审核</p>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {sections.map(([path, label]) => <Link key={path} className="btn"
          style={location.pathname === path ? { background: '#087b5a', color: '#fff' } : {}}
          to={path}>{label}</Link>)}
        <Link className="btn" to="/partner-teams">返回 Admin 规则设置</Link>
      </nav>
    </header>
    <div style={{ maxWidth: 1280, margin: '0 auto' }}><Outlet /></div>
  </div>
}
