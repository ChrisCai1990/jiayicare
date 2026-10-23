import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import React from 'react'
import { transformSync } from 'esbuild'
import * as routine from '../src/utils/initialArchiveRoutine.mjs'
const require = createRequire(import.meta.url)
const { saveSection, reviewSection, SECTION_LABELS } = require('../../backend/src/utils/initialArchiveReview.js')
const { ARCHIVE_FIELDS } = require('../../backend/src/config/archiveFields.js')
const code = transformSync(fs.readFileSync(new URL('../src/components/CoreHealthArchive.jsx', import.meta.url), 'utf8'), { loader:'jsx', format:'cjs' }).code
const children = node => [node?.props?.children].flat(Infinity).filter(value => value != null && value !== false)
const text = node => typeof node === 'string' ? node : children(node).map(text).join('')
const find = (node, predicate) => predicate(node) ? node : children(node).map(child => find(child, predicate)).find(Boolean)

function harness(section, { saveFails = false, reviewFails = false, completed = false } = {}) {
  const server = {_id:'u',healthProfile:{},coreHealthArchive:{},initialArchiveReview:{
    revision:0,status:completed?'completed':'pending',sections:{},items:[{section,questionId:section,path:section==='routine'?'height':'healthProfile.pastHistory',label:'原回答',answer:'原始资料'}],
  }}
  const user = structuredClone(server), calls = []
  let state=[], cursor=0, tree
  const api = {
    initialArchiveReviewFields: async()=>({data:ARCHIVE_FIELDS.filter(field=>['height','residence.city','ethnicity'].includes(field.path))}),
    saveCoreArchive: async(id,key,body)=>{
      calls.push(['save',key,body])
      if(saveFails)throw Error('保存失败')
      const mutation=saveSection(server,key,body,{_id:'staff'})
      server.coreHealthArchive[key]=mutation.update.$set[`coreHealthArchive.${key}`]
    },
    updatePatient:async(id,body)=>{calls.push(['routine',body]);if(saveFails)throw Error('保存失败');Object.assign(server,body)},
    reviewInitialArchive:async(id,key,body)=>{
      calls.push(['review',key,body])
      if(reviewFails)throw Error('复核冲突')
      server.initialArchiveReview=reviewSection(server,key,body,{_id:'staff'}).update.$set.initialArchiveReview
    },
  }
  const mod={exports:{}}
  const react={...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]}}
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(name){
    if(name==='react')return react
    if(name==='../api')return {staffAPI:api}
    if(name.endsWith('.css'))return {}
    if(name.endsWith('/DateField'))return {__esModule:true,default:'input'}
    if(name.endsWith('/initialArchiveRoutine.mjs'))return routine
    throw Error(name)
  }})
  const render=()=>{cursor=0;tree=mod.exports.InitialArchiveReview({user,canEdit:true,onNavigate(){},onSaved:async()=>Object.assign(user,structuredClone(server))});return tree}
  const click=async label=>{
    const root=render()
    const scope=['复核','修改资料'].includes(label) ? find(root,n=>n?.props?.className==='core-record' && text(children(n)[0])===SECTION_LABELS[section]) : root
    const button=find(scope,n=>n?.type==='button' && text(n)===label)
    assert.ok(button,`button: ${label}`);assert.ok(!button.props.disabled);await button.props.onClick();render()
  }
  const change=(label,value)=>{const row=find(render(),n=>n?.type==='label' && children(n)[0]===label);assert.ok(row,`label: ${label}`);const input=find(row,n=>['input','select','textarea'].includes(n?.type));input.props.onChange({target:{value,checked:value}});render()}
  return {server,calls,render,click,change,error:()=>text(find(render(),n=>n?.props?.role==='alert'))}
}

for(const section of Object.keys(SECTION_LABELS)) {
  test(`${section}: direct review needs no note, no extra checkboxes and no archive write`,async()=>{
    const h=harness(section)
    await h.click('复核')
    await h.click('直接复核')
    assert.deepEqual(h.calls.map(call=>call[0]),['review'])
    assert.equal(h.server.initialArchiveReview.sections[section].status,'reviewed')
    assert.equal(h.server.initialArchiveReview.items[0].answer,'原始资料')
    assert.deepEqual(h.server.coreHealthArchive,{})
  })
}
const updates = {
  family:[['疾病或健康问题','高血压'],['与客户的关系','父亲']],
  disease:[['疾病名称','高血压'],['当前状态','持续']],
  allergy:[['过敏原或相关产品','青霉素']],
  medication:[['药物／营养补充剂名称','药物自述'],['建档时剂量','原剂量']],
  symptom:[['不适主诉与症状','头痛'],['当前状态','间歇出现']],
}
for(const [section, fields] of Object.entries(updates)) {
  test(`${section}: inline updates persist before review with the new revision`,async()=>{
    const h=harness(section)
    await h.click('复核');await h.click('有更新，填写信息')
    fields.forEach(([label,value])=>h.change(label,value))
    await h.click('保存并复核')
    assert.deepEqual(h.calls.map(call=>call[0]),['save','review'])
    assert.equal(h.server.coreHealthArchive[section].records.length,1)
    assert.equal(h.calls[1][2].sectionRevision,1)
    assert.equal(h.server.initialArchiveReview.sections[section].status,'reviewed')
  })
}
test('routine: writes actual basic information before review through the patient API',async()=>{
  const h=harness('routine');await h.click('复核');await h.click('有更新，填写信息')
  h.change('身高','172');await h.click('保存并复核')
  assert.deepEqual(h.calls.map(call=>call[0]),['routine','review'])
  assert.equal(h.server.height,172)
})
test('completed routine can be corrected with a reason without reopening intake review',async()=>{
  const h=harness('routine',{completed:true})
  await h.click('修改资料');await h.click('填写修改内容')
  h.change('身高','172');await h.click('保存修改')
  assert.match(h.error(),/修改原因/)
  h.change('修改原因（必填）','客户核实后更正')
  await h.click('保存修改')
  assert.deepEqual(h.calls.map(call=>call[0]),['routine'])
  assert.equal(h.calls[0][1]._routineEditReason,'客户核实后更正')
  assert.equal(h.server.height,172)
  assert.equal(h.server.initialArchiveReview.status,'completed')
})
test('failed archive saves never mark the section reviewed',async()=>{
  const h=harness('disease',{saveFails:true});await h.click('复核');await h.click('有更新，填写信息')
  h.change('疾病名称','高血压');h.change('当前状态','持续');await h.click('保存并复核')
  assert.deepEqual(h.calls.map(call=>call[0]),['save']);assert.match(h.error(),/保存失败/)
})
test('saved archive with failed review refreshes and shows the partial result',async()=>{
  const h=harness('symptom',{reviewFails:true});await h.click('复核');await h.click('有更新，填写信息')
  h.change('不适主诉与症状','头痛');h.change('当前状态','持续');await h.click('保存并复核')
  assert.match(h.error(),/已保存，但复核未完成/);assert.equal(h.server.coreHealthArchive.symptom.revision,1)
})
test('routine updates keep siblings, reject invalid values and require explicit cultural consent',()=>{
  const user={carePreferences:{city:'上海',hospitals:'原医院'},lifestyle_data:{dailyWater:'原记录',nutritionSubjective:{note:'保留'}}}
  const fields=ARCHIVE_FIELDS.filter(field=>['carePreferences.city','lifestyle_data.dailyWater','height','birthDate','ethnicity'].includes(field.path))
  const body=routine.buildRoutineUpdate(user,fields,{'carePreferences.city':'北京','lifestyle_data.dailyWater':'1500毫升内'})
  assert.equal(body.carePreferences.hospitals,'原医院');assert.equal(body.lifestyle_data.nutritionSubjective.note,'保留')
  assert.throws(()=>routine.buildRoutineUpdate(user,fields,{height:'abc'}),/有效/)
  assert.throws(()=>routine.buildRoutineUpdate(user,fields,{birthDate:'2026-02-30'}),/有效/)
  assert.throws(()=>routine.buildRoutineUpdate(user,fields,{ethnicity:'测试'}),/自愿/)
  assert.equal(routine.buildRoutineUpdate(user,fields,{ethnicity:'测试'},true).culturalPreferencesConfirmed,true)
})
