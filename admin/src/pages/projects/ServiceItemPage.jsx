import React from 'react'
import { adminAPI } from '../../api'
import ProjectPage from './_ProjectPage'

const FIELDS = [
  { key: 'name',        label: '服务名称', required: true, fullWidth: true, placeholder: '如：专家咨询、陪诊服务' },
  { key: 'mnemonic',    label: '助记码',   placeholder: '拼音首字母（自动生成）' },
  { key: 'unit',        label: '单位',     placeholder: '如：次、小时' },
  { key: 'costPrice',   label: '成本价（元）', type: 'number', defaultValue: 0 },
  { key: 'retailPrice', label: '零售价（元）', type: 'number', defaultValue: 0, required: true },
  { key: 'participatesInDiscount', label: '参与优惠', type: 'checkbox', defaultValue: true },
]

export default function ServiceItemPage() {
  return (
    <ProjectPage
      title="服务项目"
      desc='非医疗类服务，如"专家咨询""陪诊"'
      fields={FIELDS}
      fetchFn={adminAPI.serviceItems}
      createFn={adminAPI.createServiceItem}
      updateFn={adminAPI.updateServiceItem}
      toggleFn={adminAPI.toggleServiceItem}
      deleteFn={adminAPI.deleteServiceItem}
    />
  )
}
