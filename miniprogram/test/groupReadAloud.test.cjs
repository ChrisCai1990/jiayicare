const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

test('group read-aloud respects consent, stops on hide and ignores obsolete synthesis', async () => {
  const source = fs.readFileSync(require.resolve('../src/hooks/useGroupReadAloud.js'), 'utf8');
  const {code} = transformSync(source, {format:'cjs'});
  let hide, allowed = false, plays = 0, destroyed = 0;
  const calls = [];
  const player = { onPlay(){}, onEnded(){}, onError(){}, play(){plays++}, stop(){}, destroy(){destroyed++} };
  const mocks = {
    react:{useState:()=>[null,()=>{}],useRef:()=>({current:null}),useEffect(){}},
    '@tarojs/taro':{useDidHide:fn=>{hide=fn},createInnerAudioContext:()=>player},
    '../utils/aiDataConsent':{ensureAiDataConsent:async purpose=>{assert.equal(purpose,'speech');return allowed}},
    '../services/api':{ttsAPI:{synthesize:(text,scene)=>new Promise(resolve=>calls.push({text,scene,resolve}))}}
  };
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:id=>mocks[id]});
  const {toggle}=module.exports.default();
  await toggle('1','甲');
  assert.equal(calls.length,0);
  allowed=true;
  const first=toggle('1','甲'); await new Promise(resolve=>setImmediate(resolve));
  const second=toggle('2','乙'); await Promise.resolve();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls.map(c=>[c.text,c.scene]),[['甲','message'],['乙','message']]);
  calls[0].resolve({url:'old'}); await first; assert.equal(plays,0);
  calls[1].resolve({url:'current'}); await second; assert.equal(plays,1);
  hide(); assert.equal(destroyed,1);
});