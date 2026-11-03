const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function render(name,props){const code=transformSync(fs.readFileSync(path.join(__dirname,`../src/components/${name}.jsx`),'utf8'),{loader:'jsx',format:'cjs'}).code;const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports,require});return renderToStaticMarkup(React.createElement(mod.exports.default,props));}
test('standard reply explicitly collects review decision and preserves previous recommendations',()=>{const html=render('ExpertReplyForm',{member:{opinion:'原意见',nextStep:'原安排',reviewMode:'needed',reviewRecommendations:[{time:'两周后',items:'血常规'}]}});for(const value of ['原意见','两周后','血常规'])assert.ok(html.includes(value));});
test('advisor draft requires confirmation and exposes unresolved relative timing',()=>{const html=render('ConsultationFollowupReview',{consultation:{members:[{nextStep:'复查'}],followupDraft:{items:[{date:'',items:'血常规',timeText:'两周后',sourceText:'两周后复查血常规'}]}}});assert.ok(html.includes('两周后复查血常规'));assert.match(html,/disabled=""[^>]*>审核通过并发布随访计划/);});
test('partially published approval offers resume without editable replacement',()=>{const html=render('ConsultationFollowupReview',{consultation:{members:[],followupReviewedAt:'2026-11-03'}});assert.ok(html.includes('继续发布随访计划'));assert.ok(!html.includes('<textarea'));});
