import React from 'react'
import { adminAPI } from '../../api'
import ProjectPage from './_ProjectPage'

const FIELDS = [
  { key: 'name',           label: '检验项目名称', required: true,  fullWidth: true, placeholder: '如：空腹血糖' },
  { key: 'mnemonic',       label: '助记码',       placeholder: '拼音首字母（自动生成）' },
  { key: 'unit',           label: '单位',         placeholder: '如：次、项' },
  { key: 'costPrice',      label: '成本价（元）', type: 'number',  defaultValue: 0 },
  { key: 'retailPrice',    label: '零售价（元）', type: 'number',  defaultValue: 0 },
  { key: 'referenceRange', label: '参考范围',     fullWidth: true, placeholder: '如：3.9-6.1 mmol/L' },
]

export default function LabTestItemPage() {
  return (
    <ProjectPage
      title="检验项目"
      desc="单个检验指标，如"空腹血糖""血红蛋白""
      fields={FIELDS}
      fetchFn={adminAPI.labTestItems}
      createFn={adminAPI.createLabTestItem}
      updateFn={adminAPI.updateLabTestItem}
      toggleFn={adminAPI.toggleLabTestItem}
      deleteFn={adminAPI.deleteLabTestItem}
    />
  )
}
