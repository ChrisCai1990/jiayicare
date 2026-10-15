const {chromium,webkit,devices}=require('C:/Users/huawei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const useWebkit=process.env.REVIEW_NAV_WEBKIT==='true';
 const engine=useWebkit?'webkit':'chromium';
 const browser=await (useWebkit?webkit:chromium).launch(useWebkit?{headless:true}:{channel:'msedge',headless:true});
 // Windows Playwright WebKit's certificate store differs from the OS. The same
 // origin was verified with the OS-trusting Chromium/urllib clients; this local
 // test-only override does not change the app or server TLS configuration.
 const p=await browser.newPage(useWebkit?{...devices['iPhone 13'],ignoreHTTPSErrors:true}:{viewport:{width:390,height:844}});
 const errors=[],bad=[],steps=[],failed=[];
 if(process.env.REVIEW_NAV_CANDIDATE==='true') await p.route('**/mobile-preview/demo/entry.js*',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'miniprogram/review-demo/entry.js'),'utf8')}));
 p.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
 p.on('requestfailed',r=>failed.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
 p.on('response',r=>{if(r.status()>=400)bad.push({path:new URL(r.url()).pathname,status:r.status()})});
 const snapshot=async(name)=>{
  await p.waitForTimeout(1300);
  const state=await p.evaluate(()=>({url:location.pathname+location.hash,text:document.body.innerText.slice(0,4000),
   pages:[...document.querySelectorAll('.taro_page')].map(e=>({id:e.id,display:getComputedStyle(e).display,style:e.getAttribute('style'),hidden:e.getAttribute('hidden'),class:e.className,height:e.getBoundingClientRect().height}))}));
  steps.push({name,...state});await p.screenshot({path:path.join(root,'artifacts',`demo-nav-${engine}-${steps.length}.png`)});
  if(state.text.length<40){
    console.log(JSON.stringify({hiddenPages:state.pages}));
    if(process.env.REVIEW_NAV_INSPECT==='true'){
     console.log(JSON.stringify(await p.evaluate(()=>{
      const e=[...document.querySelectorAll('.taro_page')].find(e=>e.id.startsWith('/pages/home/index?'));
      const before=e.getAttribute('style');e.style.removeProperty('display');
      return {before,after:e.getAttribute('style'),computed:getComputedStyle(e).display,text:document.body.innerText.length};
     })));
    }
  }
  console.log(JSON.stringify({name,url:state.url,chars:state.text.length,errors:errors.length}));
  assert(state.text.length>40, name+': blank content');
  const visible=state.pages.filter(e=>e.display!=='none'&&e.height>0);
  assert.equal(visible.length,1,name+': exactly one page should be visible');
  assert.equal(visible[0].id.split('?')[0],state.url.split('#')[1].split('?')[0],name+': visible route must match');
 };
 try{
  await p.goto('https://app.joinwehealth.com/mobile-preview/demo/');await p.locator('#consent').check();await p.locator('#enter').click();
  await p.waitForURL('**/review/#/pages/home/index',{timeout:45000});await snapshot('start');
  for(const name of ['健康档案','健康管家','我的','健康档案']){
   await p.locator('.weui-tabbar__item').filter({hasText:name}).click();await snapshot(name);
   if(name==='健康档案') await p.getByText('‹ 返回首页',{exact:true}).click();
   else await p.locator('.weui-tabbar__item').filter({hasText:'首页'}).click();
   await snapshot('return-'+name);
  }
  await p.getByText('记录健康数据',{exact:true}).click();await snapshot('checkin');
  await p.goBack();await snapshot('history-back');
  await p.goForward();await snapshot('history-forward');
  await p.goBack();await snapshot('history-back-again');
  // Let the page's initial reads finish before intentionally destroying its
  // execution context; WebKit reports canceled fetches as access-control errors.
  await p.waitForLoadState('networkidle',{timeout:15000});
  await p.reload();await snapshot('reload-home');
  await p.locator('.weui-tabbar__item').filter({hasText:'健康档案'}).click();await snapshot('records-after-reload');
  await p.locator('.weui-tabbar__item').filter({hasText:'首页'}).click();await snapshot('home-after-reload');
  assert.equal(errors.length,0,'no unhandled script errors');
  assert.equal(bad.length,0,'no failing HTTP responses');
 }catch(e){console.log(e.message);steps.push({failure:e.message});await p.screenshot({path:path.join(root,'artifacts/demo-nav-failure.png')});process.exitCode=1}
 finally{
  fs.writeFileSync(path.join(root,`artifacts/demo-nav-${process.env.REVIEW_NAV_CANDIDATE==='true'?'candidate':'live'}-${engine}-20261015.json`),JSON.stringify({steps,errors,bad,failed,passed:!process.exitCode},null,2));
  console.log(JSON.stringify({errors,bad,failed}));await browser.close();
 }
})();
