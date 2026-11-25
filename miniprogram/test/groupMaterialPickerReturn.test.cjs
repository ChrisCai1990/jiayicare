const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {transformSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const React = require('react');
const {createRoot} = require('react-dom/client');
const act = React.act || require('react-dom/test-utils').act;

test('selected Android photo remains visible through return, failed upload and retry', async () => {
  const dom = new JSDOM('<div id="app"></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  const notices = [];
  let select, read, settle;
  const source = fs.readFileSync(require.resolve('../src/components/GroupMaterialUpload.jsx'),'utf8');
  const code = transformSync(source,{loader:'jsx',format:'cjs',define:{'process.env.TARO_ENV':'"weapp"'}}).code;
  const mocks = {
    react: React,
    '@tarojs/components': {View:'div',Text:'span'},
    '@tarojs/taro': {showModal:()=>{},showToast:value=>notices.push(value.title)},
    './ChatAttachment': ({label,onClick})=>React.createElement('button',{onClick},label),
    '../utils/readChatFile': {readChatFile:()=>new Promise(resolve=>{read=resolve})},
    '../utils/aiDataConsent': {ensureAiDataConsent:async()=>false},
    '../utils/chooseBrowserFile': {},
    '../utils/imagePicker': {chooseImageWithPrivacy:()=>new Promise(resolve=>{select=resolve}),isImagePickerCancelled:()=>false},
    '../services/api': {inAppServiceGroupAPI:{uploadMaterial:(_id,body)=>{
      requests.push(body);
      return new Promise(resolve=>{settle=resolve});
    }}},
  };
  const mod={exports:{}};
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require:key=>mocks[key]});
  const root=createRoot(document.getElementById('app'));
  const render=panelOpen=>root.render(React.createElement(mod.exports.default,{expanded:true,panelOpen,groupId:'test'}));
  try {
    await act(async()=>render(true));
    await act(async()=>document.querySelector('button').click());
    await act(async()=>render(false));
    await act(async()=>select({tempFiles:[{tempFilePath:'wxfile://synthetic.jpg',size:15}]}));
    assert.match(document.body.textContent,/正在读取资料 1\/1/);
    await act(async()=>read('data:image/jpeg;base64,/9j/'));
    assert.match(document.body.textContent,/正在上传 1 份资料/);
    await act(async()=>settle({success:true,data:{}}));
    assert.match(document.body.textContent,/重试提交医疗资料/);
    assert.deepEqual(notices,[]);
    const retry=[...document.querySelectorAll('div')].find(el=>el.textContent==='重试提交医疗资料');
    await act(async()=>retry.click());
    assert.equal(requests[0].requestId,requests[1].requestId);
    await act(async()=>settle({success:true,data:{reportId:'report-1'}}));
    assert.deepEqual(notices,['资料已提交']);
  } finally {
    await act(async()=>root.unmount());
    dom.window.close();
  }
});
