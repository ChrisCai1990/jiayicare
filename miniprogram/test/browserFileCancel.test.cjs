const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/utils/chooseBrowserFile.js'),'utf8');
const helper=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function environment(){
 const win=new EventTarget(),doc=new EventTarget();let input;
 doc.visibilityState='visible';doc.body={appendChild:()=>{}};
 doc.createElement=()=>input={style:{},files:[],click(){},remove(){this.removed=true;}};
 return {window:win,document:doc,get input(){return input;}};
}
test('cancel, old WebView focus return, explicit abort, and subsequent selection cleanly settle',async()=>{
 const {chooseBrowserFile}=await helper;
 for(const mode of ['cancel','focus','visibility','abort','interaction']){
  const env=environment(),controller=new AbortController(),promise=chooseBrowserFile({...env,signal:controller.signal});
  if(mode==='cancel')env.input.oncancel();
  if(mode==='focus')env.window.dispatchEvent(new Event('focus'));
  if(mode==='visibility')env.document.dispatchEvent(new Event('visibilitychange'));
  if(mode==='abort')controller.abort();
  if(mode==='interaction'){await new Promise(r=>setTimeout(r,5));env.window.dispatchEvent(new Event('pointerdown'));}
  assert.equal(await promise,null,mode);assert.ok(env.input.removed);assert.equal(env.input.onchange,null);
  const again=chooseBrowserFile(env),file={name:'report.pdf'};env.input.files=[file];env.input.onchange();assert.equal(await again,file);
 }
});
test('focus before change preserves chosen file and does not resolve twice',async()=>{
 const {chooseBrowserFile}=await helper,env=environment(),promise=chooseBrowserFile(env);
 env.window.dispatchEvent(new Event('focus'));const file={name:'chosen.pdf'};env.input.files=[file];env.input.onchange();assert.equal(await promise,file);assert.ok(env.input.removed);
});
