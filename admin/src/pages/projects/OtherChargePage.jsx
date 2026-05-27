import React from 'react'
import { adminAPI } from '../../api'
import ProjectPage from './_ProjectPage'

const FIELDS = [
  { key: 'name',        label: '收费名称', required: true, fullWidth: true, placeholder: '如：挂号费、材料费、快递费' },
  { key: 'mnemonic',    label: '助记码',   placeholder: '手动填写' },
  { key: 'unit',        label: '单位',     type: 'select', options: [
    { value: '次', label: '次' }, { value: '项', label: '项' }, { value: '个', label: '个' },
    { value: '份', label: '份' }, { value: '张', label: '张' },
  ], defaultValue: '次' },
  { key: 'costPrice',   label: '成本价（元）', type: 'number', defaultValue: 0 },
  { key: 'retailPrice', label: '零售价（元）', type: 'number', defaultValue: 0, required: true },
  { key: 'participatesInDiscount', label: '参与优惠', type: 'checkbox', defaultValue: true },
  { key: 'remark',      label: '备注',     fullWidth: true, placeholder: '选填' },
]

export default function OtherChargePage() {
  return (
    <ProjectPage
      title="其他收费"
      desc='杂项费用，如"挂号费""材料费""快递费"'
      fields={FIELDS}
      fetchFn={adminAPI.otherCharges}
      createFn={adminAPI.createOtherCharge}
      updateFn={adminAPI.updateOtherCharge}
      toggleFn={adminAPI.toggleOtherCharge}
      deleteFn={adminAPI.deleteOtherCharge}
    />
  )
}
