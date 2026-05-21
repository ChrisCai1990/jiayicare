import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

const DISEASE_TAGS = ['高血压', '糖尿病', '高血脂', '冠心病', '慢阻肺', '骨质疏松']
const TYPE_LABEL = { regular: '普通', vip: 'VIP', trial: '试用', '': '全部' }

export default function PatientsPage() {
  const nav = useNavigate()
  const [patients, setPatients] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [disease, setDisease] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPatients({ page, limit, search, disease })
      setPatients(res.data.patients)
      setTotal(res.data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, search, disease])

  useEffect(() => { load() }, [load])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">我的会员</h1>
          <p className="page-subtitle">共 {total} 位会员</p>
        </div>
        <button className="btn btn-primary" onClick={() => nav('/patients/new')}>＋ 新增会员</button>
      </div>

      {/* 搜索与过滤 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label className="form-label">搜索</label>
              <input
                className="form-input"
                placeholder="姓名 / 手机号"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label className="form-label">慢病筛选</label>
              <select className="form-input" value={disease} onChange={e => { setDisease(e.target.value); setPage(1) }}>
                <option value="">全部慢病</option>
                {DISEASE_TAGS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: 38 }}>搜索</button>
            <button type="button" className="btn btn-secondary" style={{ height: 38 }}
              onClick={() => { setSearch(''); setDisease(''); setPage(1) }}>
              重置
            </button>
          </form>
        </div>
      </div>

      {/* 会员列表 */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : patients.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            暂无会员数据，<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={() => nav('/patients/new')}>点击新增会员</span>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>手机号</th>
                <th>性别/年龄</th>
                <th>慢病</th>
                <th>健管专员</th>
                <th>家庭医生</th>
                <th>会员类型</th>
                <th>健康评分</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(p => (
                <tr key={p._id} onClick={() => nav(`/patients/${p._id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.patientType === 'vip' && <span className="badge badge-warning" style={{ marginLeft: 6 }}>VIP</span>}
                  </td>
                  <td style={{ color: '#666' }}>{p.phone}</td>
                  <td style={{ color: '#666' }}>{p.gender} {p.age ? `${p.age}岁` : '-'}</td>
                  <td>
                    {p.chronicDiseases?.length > 0
                      ? p.chronicDiseases.map(d => (
                          <span key={d} className="badge badge-danger" style={{ marginRight: 4 }}>{d}</span>
                        ))
                      : <span style={{ color: '#ccc' }}>-</span>}
                  </td>
                  <td style={{ color: '#666' }}>{p.assignedHealthManager?.name || '-'}</td>
                  <td style={{ color: '#666' }}>{p.assignedFamilyDoctor?.name || '-'}</td>
                  <td>
                    {p.servicePackage
                      ? <span className="badge badge-success">{p.servicePackage}</span>
                      : <span style={{ color: '#ccc' }}>-</span>}
                  </td>
                  <td>
                    {p.healthScore ? (
                      <span style={{ fontWeight: 600, color: p.healthScore >= 80 ? '#22A06B' : p.healthScore >= 60 ? '#D97706' : '#DC3545' }}>
                        {p.healthScore}
                      </span>
                    ) : '-'}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm"
                      onClick={e => { e.stopPropagation(); nav(`/patients/${p._id}`) }}>
                      查看
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
    </div>
  )
}
