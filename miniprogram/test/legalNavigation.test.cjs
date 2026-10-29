const assert = require('node:assert/strict');
const {test} = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const src = fs.readFileSync('miniprogram/src/utils/legalNavigation.js','utf8').replace('export function','function');
const {returnFromLegal} = vm.runInNewContext(src+';({returnFromLegal})',{URL});
function fixture(count, referrer='') {
 const events=[];
 const taro={getCurrentPages:()=>Array(count).fill({}),navigateBack:o=>events.push(['back',o]),redirectTo:o=>events.push(['login',o.url])};
 const browser={document:{referrer},location:{origin:'https://app.joinwehealth.com',replace:url=>events.push(['replace',url])}};
 return {taro,browser,events};
}
test('ordinary in-app legal navigation returns to the previous page',()=>{const f=fixture(2);returnFromLegal(f);assert.equal(f.events[0][0],'back');});
test('standalone demo entry returns to the same demo page',()=>{const f=fixture(1);returnFromLegal({...f,from:'demo'});assert.equal(f.events[0][1],'/mobile-preview/demo/');});
test('cached old demo links also return using same-origin referrer',()=>{const f=fixture(1,'https://app.joinwehealth.com/mobile-preview/demo/');returnFromLegal(f);assert.equal(f.events[0][0],'replace');});
test('direct/external entry falls back to login without open redirects',()=>{for(const ref of ['', 'https://evil.example/mobile-preview/demo/']){const f=fixture(1,ref);returnFromLegal({...f,from:'https://evil.example'});assert.equal(f.events[0][0],'login');}});
test('failed native stack return falls back to login',()=>{const f=fixture(2);returnFromLegal({...f,browser:null});f.events[0][1].fail();assert.equal(f.events[1][0],'login');});
