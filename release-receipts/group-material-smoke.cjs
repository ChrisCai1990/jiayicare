const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('../../team-service-supervision-20261113/node_modules/playwright');
const root=path.resolve('../app-h5-push-release-20261112/miniprogram/dist');
const user={_id:'test-user',name:'合成客户',onboardingCompleted:true};
const group={id:'test-group',name:'合成客户嘉医服务群',patientName:'合成客户',staff:[{id:'staff1',name:'合成健管',role:'healthManager'}],assistant:{avatar:''}};
const server=http.createServer((req,res)=>{const f=path.join(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\/mobile-preview\//,''));if(!f.startsWith(root)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>server.listen(8776,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});try{
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(u=>{localStorage.setItem('jy_token',JSON.stringify({data:'synthetic-token'}));localStorage.setItem('jy_user',JSON.stringify({data:JSON.stringify(u)}));},user);
let uploads=[];let messages=[];
await page.route('**/api/**',async route=>{const url=route.request().url();let data=[];
if(url.endsWith('/materials')){const body=route.request().postDataJSON();uploads.push(body);messages=[{id:'m1',senderType:'customer',senderName:'合成客户',content:'已提交整份体检报告',createdAt:new Date().toISOString(),material:{id:'report1',status:'待健管专员核对',files:[],mimeType:'image/png'}}];data={id:'m1'};}
else if(url.includes('/user/me'))data=user;
else if(url.endsWith('/in-app-service-groups'))data=[group];
else if(url.includes('/in-app-service-groups/test-group/messages'))data=messages;
else if(url.includes('ai-data-consent'))data=[{purpose:'health',available:true,granted:true}];
return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data,count:0})});});
await page.goto('http://127.0.0.1:8776/mobile-preview/index.html#/pages/messages/service-group/index?groupId=test-group');
await page.getByText('＋ 上传医疗资料',{exact:true}).waitFor({timeout:20000});
await page.getByText('＋ 上传医疗资料',{exact:true}).click();
await page.getByText('整份体检报告',{exact:true}).click();
await page.getByText('选择资料',{exact:true}).click();
await page.getByText('拍照 / 相册图片',{exact:true}).waitFor();
const chooser=page.waitForEvent('filechooser');await page.getByText('拍照 / 相册图片',{exact:true}).click();
await(await chooser).setFiles({name:'report.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
await page.getByText('已提交整份体检报告',{exact:true}).waitFor({timeout:10000});
assert.equal(uploads.length,1);assert.equal(uploads[0].category,'physical_exam');assert.equal(uploads[0].files.length,1);
for(const viewport of [{width:390,height:844},{width:393,height:650}]){await page.setViewportSize(viewport);const rect=await page.getByText('＋ 上传医疗资料',{exact:true}).boundingBox();assert.ok(rect.y+rect.height<viewport.height);}
await page.screenshot({path:path.resolve('release-receipts/group-material-mobile.png')});assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: whole-report selection, file upload payload, status refresh and small-screen controls');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
