import React from 'react'
import schema from '../../../shared/professionalAssessmentForm.cjs'
export default function ProfessionalAssessmentFields({value,onChange,disabled=false}) {
  return <div style={{display:'grid',gap:10}}>
    {[['domain','评估领域'],['title','评估标题'],...schema.fields].map(([key,label])=><label key={key}>{label}{key==='facts'?'（提交时必填）':''}
      {['domain','title'].includes(key)?<input className="form-control" disabled={disabled} value={value[key]||''} onChange={e=>onChange({...value,[key]:e.target.value})}/>:<textarea className="form-control" rows={3} disabled={disabled} placeholder="每行一项" value={value[key]||''} onChange={e=>onChange({...value,[key]:e.target.value})}/>}
    </label>)}
  </div>
}
