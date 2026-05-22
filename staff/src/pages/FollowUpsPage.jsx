import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'
import FollowUpModal from '../components/FollowUpModal'

const TYPE_MAP = { phone: '电话', wechat: '微信', visit: '上门', video: '视频', other: '其他' }
const STATUS_MAP = { completed: '已完成', missed: '未接通', planned: '计划中' }
const STATUS_COLOR = { completed: '#22A06B', missed: '#DC3545', planned: '#D97706' }

export default function FollowUpsPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [followUps, setFollowUps] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getFollowUps({ page, limit, status })
      setFollowUps(res.data.followUps)
      setTotal(res.data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条随访记录吗？')) return
    try {
      await staffAPI.deleteFollowUp(id)
      toast('已删除')
      load()
    } catch (err) {
      toast(err.message || '删除失败')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">随访管理</h1>
          <p className="page-subtitle">共 {total} 条记录</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ 新增随访</button>
      </div>

      {/* 过滤 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: '#4A6558' }}>状态：</span>
          {[
            { v: '', l: '全部' },
            { v: 'completed', l: '已完成' },
            { v: 'planned', l: '计划中' },
            { v: 'missed', l: '未接通' },
          ].map(opt => (
            <button
              key={opt.v}
              className={`btn ${status === opt.v ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => { setStatus(opt.v); setPage(1) }}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : followUps.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            暂无随访记录，<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={() => setShowModal(true)}>立即记录</span>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>会员</th>
                <th>随访日期</th>
                <th>方式</th>
                <th>状态</th>
                <th>内容摘要</th>
                <th>下次随访</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {followUps.map(f => (
                <tr key={f._id}>
                  <td>
                    <span
                      style={{ color: '#1E6B50', cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => nav(`/patients/${f.patientId?._id}`)}
                    >
                      {f.patientId?.name || '-'}
                    </span>
                    <div style={{ fontSize: 12, color: '#8AA89C' }}>{f.patientId?.phone}</div>
                  </td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>
                    {new Date(f.date).toLocaleDateString('zh-CN')}
                  </td>
                  <td><span className="badge badge-info">{TYPE_MAP[f.type]}</span></td>
                  <td>
                    <span style={{ color: STATUS_COLOR[f.status], fontWeight: 500, fontSize: 13 }}>
                      {STATUS_MAP[f.status]}
                    </span>
                  </td>
                  <td style={{ maxWidth: 200, fontSize: 13, color: '#4A6558' }}>
                    {f.content ? (f.content.length > 40 ? f.content.slice(0, 40) + '...' : f.content) : '-'}
                  </td>
                  <td style={{ fontSize: 13, color: '#8AA89C' }}>
                    {f.nextFollowUpDate ? new Date(f.nextFollowUpDate).toLocaleDateString('zh-CN') : '-'}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => nav(`/patients/${f.patientId?._id}`)}
                    >
                      查看会员
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ marginLeft: 6 }}
                      onClick={() => handleDelete(f._id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', color: '#666', fontSize: 14 }}>
            第 {page} / {Math.ceil(total / limit)} 页
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {showModal && (
        <FollowUpModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); toast('随访记录已保存'); load() }}
        />
      )}
    </div>
  )
}
