import React from 'react'
import { adminAPI } from '../../api'
import ProjectPage from './_ProjectPage'

const FIELDS = [
  { key: 'name',        label: '收费名称', required: true, fullWidth: true, placeholder: '如：挂号费、材料费' },
  { key: 'mnemonic',    label: '助记码',   placeholder: '拼音首字母' },
  { key: 'unit',        label: '单位',     placeholder: '如：次' },
  { key: 'costPrice',   label: '成本价（元）', type: 'number', defaultValue: 0 },
  { key: 'retailPrice', label: '零售价（元）', type: 'number', defaultValue: 0 },
]

export default function OtherChargePage() {
  return (
    <ProjectPage
      title="其他收费"
      desc='杂项收费，如"挂号费""材料费""诊察费"'
      fields={FIELDS}
      fetchFn={adminAPI.otherCharges}
      createFn={adminAPI.createOtherCharge}
      updateFn={adminAPI.updateOtherCharge}
      toggleFn={adminAPI.toggleOtherCharge}
      deleteFn={adminAPI.deleteOtherCharge}
    />
  )
}
