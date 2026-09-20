import React from 'react'
import { checkupConclusionStage } from '../utils/checkupTaskRouting'

export default function CheckupConclusionForm({ task, value, onChange }) {
  const final = checkupConclusionStage(task) === 'final_acceptance'
  return <section>
    <h4>{final ? '最终验收结论' : '体检结果评估与后续安排'}</h4>
    <p>{final ? '核对已完成环节、客户沟通结果及遗留事项交接；本结论不会代替前置岗位执行。' : '依据已审核报告填写评估结论和后续随访安排；无需跟进时说明依据。本环节不重复回收报告。'}</p>
    <label>{final ? '验收结论与遗留事项（必填）' : '评估结论与随访安排（必填）'}
      <textarea className="form-control" rows={6} value={value || ''} onChange={e => onChange(e.target.value)} />
    </label>
  </section>
}
