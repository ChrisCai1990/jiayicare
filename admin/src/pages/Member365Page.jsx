import React, { useState, useEffect, useCallback } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const STATUS_LABEL = { none: '未申请', pending: '待激活', active: '有效', expired: '已过期' }
const STATUS_COLOR = { none: '#ccc', pending: '#D97706', active: '#22A06B', expired: '#8AA89C' }

export default function Member365Page() {
  const toast = useToast()
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminAPI.member365List()
      setList(res.data || [])
    } catch (e) { toast(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const activate = async (userId, months = 12) => {
    if (!window.confirm(`激活该用户 ${months} 个月 365 会员？`)) return
    try {
      const res = await adminAPI.member365Activate(userId, months)
      toast(res.message || '已激活')
      load()
    } catch (e) { toast(e.message || '操作失败') }
  }

  const revoke = async (userId) => {
    if (!window.confirm('确定撤销该用户的 365 会员资格？')) return
    try {
      await adminAPI.member365Revoke(userId)
      toast('已撤销')
      load()
    } catch (e) { toast(e.message || '操作失败') }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">365 会员管理</h1>
          <p className="page-subtitle">共 {list.length} 条申请记录</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>↻ 刷新</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无 365 会员申请</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>手机号</th>
                <th>状态</th>
                <th>开始时间</th>
                <th>到期时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map(u => (
                <tr key={u._id}>
                  <td style={{ fontWeight: 600 }}>{u.name || '—'}</td>
                  <td style={{ color: '#4A6558' }}>{u.phone}</td>
                  <td>
                    <span style={{ color: STATUS_COLOR[u.member365Status] || '#ccc', fontWeight: 600, fontSize: 13 }}>
                      {STATUS_LABEL[u.member365Status] || u.member365Status}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>
                    {u.member365StartAt ? new Date(u.member365StartAt).toLocaleDateString('zh-CN') : '—'}
                  </td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>
                    {u.member365ExpiresAt ? new Date(u.member365ExpiresAt).toLocaleDateString('zh-CN') : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {(u.member365Status === 'pending' || u.member365Status === 'expired') && (
                      <>
                        <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }}
                          onClick={() => activate(u._id, 12)}>激活 12 月</button>
                        <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                          onClick={() => activate(u._id, 1)}>激活 1 月</button>
                      </>
                    )}
                    {u.member365Status === 'active' && (
                      <>
                        <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                          onClick={() => activate(u._id, 12)}>续期 12 月</button>
                        <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc', marginRight: 6 }}
                          onClick={() => revoke(u._id)}>撤销</button>
                      </>
                    )}
                    {u.member365Status === 'none' && (
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => activate(u._id, 12)}>手动激活</button>
                    )}
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
