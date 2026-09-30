const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs'),path=require('node:path');
const {transformSync}=require('esbuild');
function harness(os='android',search='') {
 const states=[],effects=[],calls=[]; let index=0;const deps=[];
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'fragment',useState:init=>{const i=index++;if(!(i in states))states[i]=init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect:(fn,d)=>{const i=index++;if(!deps[i]||d.some((x,j)=>x!==deps[i][j])){deps[i]=d;effects.push(fn)}}};
 const api={sendCode:async(...a)=>{calls.push(['send',...a]);return {code:'123456'}},login:async(...a)=>{calls.push(['login',...a]);return {success:true,data:{user:{},token:'test'}}},wechatLogin:async(...a)=>{calls.push(['wechat',...a]);return {success:true,data:{user:{},token:'test'}}}};
 const browser={location:{origin:'https://example.invalid',search,pathname:'/login'},history:{replaceState(){}}};
 const ctx={module:{exports:{}},process:{env:{EXPO_PUBLIC_WECHAT_APPID:'wxTest'}},window:browser,URLSearchParams,setTimeout:()=>1,clearTimeout:()=>{},require:n=>n==='react'?React:n==='react-native'?{Platform:{OS:os},Dimensions:{get:()=>({height:800})},StyleSheet:{create:v=>v},Linking:{}}:n==='@expo/vector-icons'?{Ionicons:'Icon'}:n.endsWith('theme')?{colors:{},spacing:{},radius:{},shadow:{}}:n.endsWith('/api')?{authAPI:api}:{useAuth:()=>({login:async()=>calls.push(['session'])})}};
 vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src/screens/auth/LoginScreen.js'),'utf8'),{loader:'jsx',format:'cjs'}).code,ctx);
 const render=()=>{index=0;const tree=ctx.module.exports.default({navigation:{navigate:(...a)=>calls.push(['navigate',...a])}});while(effects.length)effects.shift()();return tree};
 const all=t=>t&&typeof t==='object'?[t,...(t.children||[]).flat(Infinity).flatMap(all)]:[];
 const text=t=>typeof t==='string'?t:t&&typeof t==='object'?(t.children||[]).flat(Infinity).map(text).join(''):'';
 const button=(t,label)=>all(t).find(n=>n.props.onPress&&text(n).includes(label));
 const agree=t=>all(t).find(n=>n.props.accessibilityRole==='checkbox').props.onPress();
 const fill=t=>{all(t).find(n=>n.props.placeholder==='请输入手机号').props.onChangeText('13900000000');all(t).find(n=>n.props.placeholder==='输入验证码').props.onChangeText('654321')};
 return {render,calls,all,text,button,agree,fill};
}
test('consent blocks network, policies remain accessible, withdrawal blocks login',async()=>{const h=harness();let t=h.render();assert.equal(h.all(t).find(n=>n.props.accessibilityRole==='checkbox').props.accessibilityState.checked,false);h.fill(t);t=h.render();await h.button(t,'获取验证码').props.onPress();await h.button(t,'立即登录').props.onPress();assert.equal(h.calls.length,0);h.button(t,'《隐私政策》').props.onPress();assert.equal(h.calls[0][0],'navigate');h.agree(t);t=h.render();await h.button(t,'获取验证码').props.onPress();t=h.render();assert.equal(h.all(t).find(n=>n.props.placeholder==='输入验证码').props.value,'654321');await h.button(t,'立即登录').props.onPress();assert.ok(h.calls.some(x=>x[0]==='login'&&x[1]==='13900000000'&&x[2]==='654321'));t=h.render();h.agree(t);t=h.render();const before=h.calls.length;await h.button(t,'立即登录').props.onPress();assert.equal(h.calls.length,before);assert.ok(!h.text(t).includes('演示体验'));assert.ok(!h.text(t).includes('10,000+'));});
test('OAuth callback waits for explicit consent',async()=>{const h=harness('web','?code=oneTimeCode&state=jy_wechat');let t=h.render();assert.equal(h.calls.length,0);h.agree(t);h.render();await new Promise(r=>setImmediate(r));assert.equal(h.calls.filter(x=>x[0]==='wechat').length,1);h.render();assert.equal(h.calls.filter(x=>x[0]==='wechat').length,1);});
