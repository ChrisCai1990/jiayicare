import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

export default function PatientInventoryConsumption({ patientId }) {
  const nav = useNavigate()
  const [data, setData] = useState({ manual: [], orders: [] })
  const [error, setError] = useState('')
  const refresh = () => staffAPI.patientInventoryConsumption(patientId).then(r => setData(r.data)).catch(e => setError(e.message))
  useEffect(() => { refresh() }, [patientId])
  return <div className="card">
    <div className="card-header"><div className="card-title">实物消费与使用</div><div style={{ display:'flex', gap:8 }}><button className="btn btn-secondary btn-sm" onClick={refresh}>刷新</button><button className="btn btn-primary btn-sm" onClick={() => nav(`/inventory?patientId=${encodeURIComponent(patientId)}`)}>登记物资使用/消费</button></div></div>
    <div className="card-body">
      <p>商城已付款实物订单自动计入消费；医护录入消费单独显示。实际使用仅用于追踪产品去向，不重复计算收入。</p>
      {error && <div role="alert" style={{ color:'#b91c1c' }}>{error}</div>}
      <div style={{ overflowX:'auto' }}><table className="table"><thead><tr><th>时间</th><th>来源</th><th>产品</th><th>数量</th><th>金额</th><th>关联信息</th></tr></thead><tbody>
        {data.orders.map(x => <tr key={`order:${x._id}`}><td>{new Date(x.createdAt).toLocaleDateString('zh-CN')}</td><td>商城</td><td>{x.serviceName}</td><td>1</td><td>¥{Number(x.paidAmount || x.servicePrice || 0).toFixed(2)}</td><td>{x.orderNo}</td></tr>)}
        {data.manual.map(x => <tr key={`entry:${x._id}`}><td>{new Date(x.createdAt).toLocaleDateString('zh-CN')}</td><td>{x.type === 'manual_sale' ? '医护录入消费' : '实际使用'}</td><td>{x.productId?.name || '-'}</td><td>{x.units}</td><td>{x.type === 'manual_sale' ? `¥${(x.units * x.unitPrice).toFixed(2)}` : '不计收入'}</td><td>{x.batchNo || x.serialNo || x.note || '-'}</td></tr>)}
      </tbody></table></div>
      {!data.orders.length && !data.manual.length && <div>暂无实物消费或使用记录</div>}
    </div>
  </div>
}
