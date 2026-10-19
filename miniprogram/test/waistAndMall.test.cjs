const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const jsx = require('@babel/plugin-transform-react-jsx');
const commonjs = require('@babel/plugin-transform-modules-commonjs');

function mount(file, { api = {}, exports = '', props = {}, name = 'default' } = {}) {
  let cursor = 0, first = true;
  const state = [], effects = [], shows = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
    useRef(value) { return this.useState({current:value})[0]; },
    useEffect(fn) { if (first) effects.push(fn); },
    useCallback: fn => fn,
  };
  React.useRef = value => React.useState({ current: value })[0];
  const taro = { useRouter: () => ({params:{type:'waist'}}), useDidShow: fn => { if (first) shows.push(fn); }, showToast() {}, navigateBack() {}, getCurrentInstance: () => ({router:{params:{}}}) };
  const modules = {
    react: React,
    '@tarojs/components': new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key }),
    '@tarojs/taro': taro,
  };
  const src = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8') + exports;
  const code = babel.transformSync(src, {babelrc:false,configFile:false,plugins:[jsx,commonjs]}).code;
  const output = {exports:{}};
  vm.runInNewContext(code, {exports:output.exports,module:output,require(id) {
    if(modules[id]) return modules[id];
    if(id.endsWith('/theme')) return {colors:{},spacing:{},radius:{},shadow:{}};
    if(id.endsWith('/services/api')) return api;
    if(id.endsWith('/hooks/useNavBar')) return () => ({statusBarHeight:24,navBarHeight:44,totalHeight:68});
    if(id.endsWith('/context/AuthContext')) return {useAuth:()=>({user:{_id:'self'},updateUser(){}})};
    if(id.endsWith('/hooks/useArchiveSubject')) return () => ({loading:false,subject:null,subjects:[],user:{}});
    if(id.endsWith('/utils/bloodPressureTrend')) return {bloodPressurePoints:()=>[]};
    if(id.endsWith('/utils/healthFundCheckout')) return {maxFundDeduction:()=>0};
    return () => null;
  },setTimeout:fn=>fn(),console,Date}, {filename:file});
  return {effects,shows,render(){cursor=0; const tree=output.exports[name](props);first=false;return tree;}};
}
function nodes(tree) { return tree && typeof tree === 'object' ? [tree,...(tree.children||[]).flatMap(nodes)] : []; }
function content(tree) { return typeof tree === 'string' ? tree : (tree?.children||[]).map(content).join(''); }
const settle = () => new Promise(resolve=>setImmediate(resolve));

test('decimal waist saves as cm and invalid waist does not submit', async () => {
  const saved=[];
  const page=mount('pages/records/add/index.jsx',{api:{recordsAPI:{create:async value=>{saved.push(value);return {success:true};}}}});
  let tree=page.render(); page.effects.forEach(fn=>fn());
  for(const value of ['0','-2','abc','82.5']) {
    nodes(tree).find(n=>n.type==='Input').props.onInput({detail:{value}});
    tree=page.render();
    await nodes(tree).find(n=>n.type==='Button').props.onClick();
    tree=page.render();
  }
  assert.equal(saved.length,1);
  assert.equal(saved[0].type,'waist'); assert.equal(saved[0].unit,'cm'); assert.equal(saved[0].value,'82.5');
});

test('waist records refresh into time-ordered trend and latest cm value', async () => {
  const rows=[{type:'waist',value:'82.5',recordedAt:'2026-10-19T08:00:00+08:00'},{type:'waist',value:'84',recordedAt:'2026-10-18T08:00:00+08:00'}];
  const page=mount('pages/records/index/index.jsx',{api:{recordsAPI:{list:async()=>({success:true,data:rows}),trend:async type=>({success:true,data:type==='waist'?rows:[]})},ibdAPI:{status:async()=>({data:{}})},userAPI:{getMe:async()=>({success:true,data:{}})}}});
  page.render(); page.shows.forEach(fn=>fn()); await settle(); let tree=page.render();
  nodes(tree).find(n=>n.props.onClick&&content(n)==='腰围').props.onClick(); tree=page.render();
  const chart=nodes(tree).find(n=>n.props.points?.length===2);
  assert.ok(chart); assert.deepEqual(Array.from(chart.props.points,p=>p.value),[84,82.5]);
  assert.match(content(tree),/82.5 cm/);
});

test('purchase member requests initialize and return closes above scrolling content', async () => {
  let members=0,closed=0,stopped=0;
  const page=mount('pages/services/mall/index.jsx',{exports:'\nexport { PurchaseModal };',name:'PurchaseModal',props:{item:{id:'service',name:'服务',price:12800},mode:'pay',onClose:()=>closed++},api:{familyLinksAPI:{list:async()=>{members++;return {data:[]};}},guardianChildrenAPI:{list:async()=>{members++;return {data:[]};}},servicesAPI:{coupons:async()=>({success:true,data:[]})},userAPI:{getMe:async()=>({success:true,data:{}}),enterpriseSharedFundQuote:async()=>({data:{amount:0}})}}});
  let tree=page.render(); page.effects.forEach(fn=>fn()); await settle(); tree=page.render();
  assert.equal(members,2);
  const back=nodes(tree).find(n=>n.props.onClick&&content(n)==='‹ 返回商城');
  const scroll=nodes(tree).find(n=>n.type==='ScrollView');
  assert.ok(back.props.style.zIndex>scroll.props.style.zIndex);
  back.props.onClick({stopPropagation:()=>stopped++});
  assert.equal(closed,1); assert.equal(stopped,1);
});
