import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const STATUS = {
  aligned: ['已对齐', '#17845B'], unlinked: ['待建立映射', '#D78515'],
  workflow_diff: ['流程存在差异', '#C0392B'], missing_template: ['缺少医护端方案', '#C0392B'],
  missing_product: ['缺少Admin产品', '#C0392B'],
}

export default function ServiceWorkflowAlignmentPage() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const load = () => {
    setLoading(true)
    adminAPI.getServiceWorkflowReverseModel().then(res => {
      setRows(res.data || [])
      setSelected(Object.fromEntries((res.data || []).map(row => [row.key, row.product?.id || row.candidates?.[0]?.id || ''])))
    }).catch(err => toast(err.message || '加载失败')).finally(() => setLoading(false))
  }
  useEffect(load, [])
  const link = async row => {
    if (!row.template?.id || !selected[row.key]) return toast('请先确认医护端方案和Admin产品')
    setSaving(row.key)
    try {
      await adminAPI.linkServiceWorkflowReverseModel(row.template.id, { productId: selected[row.key], familyKey: row.key })
      toast('映射已保存，现有任务未被修改')
      load()
    } catch (err) { toast(err.message || '保存失败') } finally { setSaving('') }
  }
  return <div className="page-container">
    <div className="page-header"><div><h1>成熟服务流程反向建模</h1><p>以已经跑通的医护端及用户下单流程为事实来源，登记到Admin；这里只建立映射，不覆盖现有流程。</p></div></div>
    <div className="card"><div className="card-body">
      {loading ? <div style={{ padding: 30, textAlign: 'center' }}>加载中...</div> : <div style={{ overflowX: 'auto' }}><table className="data-table">
        <thead><tr><th>成熟服务</th><th>医护端方案</th><th>Admin产品</th><th>流程来源</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{rows.map(row => { const meta = STATUS[row.status] || [row.status, '#667']; return <tr key={row.key}>
          <td><strong>{row.label}</strong></td>
          <td>{row.template?.name || <span style={{ color: '#C0392B' }}>未找到</span>}<div style={{ fontSize: 11, color: '#8AA89C' }}>{row.template?.planIds?.length || 0} 个既有岗位节点</div></td>
          <td><select className="form-input" value={selected[row.key] || ''} onChange={e => setSelected(v => ({ ...v, [row.key]: e.target.value }))}><option value="">请选择产品</option>{(row.candidates || []).map(item => <option key={item.id} value={item.id}>{item.name}{item.status !== 'on' ? '（未上架）' : ''}</option>)}</select></td>
          <td>{row.codeDriven ? '已跑通的专用代码流程' : '医护端方案岗位节点'}<div style={{ fontSize: 11, color: '#8AA89C' }}>目标类型：{row.expectedWorkflowKey}</div></td>
          <td><span style={{ color: meta[1], fontWeight: 600 }}>{meta[0]}</span>{row.status === 'workflow_diff' && <div style={{ fontSize: 11, color: '#8AA89C' }}>暂不自动覆盖，请人工核对</div>}</td>
          <td><button className="btn btn-primary btn-sm" disabled={!row.template || !selected[row.key] || saving === row.key} onClick={() => link(row)}>{saving === row.key ? '保存中' : row.status === 'aligned' ? '重新确认映射' : '建立映射'}</button></td>
        </tr> })}</tbody>
      </table></div>}
    </div></div>
  </div>
}
