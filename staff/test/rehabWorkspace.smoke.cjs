// Synthetic browser fixture only; no production customer/API access.
const {build}=require('esbuild');
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import RehabWorkspace from './src/components/RehabWorkspace';createRoot(document.getElementById('root')).render(<RehabWorkspace patientId="fixture" staff={{_id:'staff',role:'superadmin'}} view={new URLSearchParams(location.search).get('view')||'assessment'}/>);`,resolveDir:root,loader:'jsx'},bundle:true,write:false,define:{'import.meta.env':'{}','process.env.NODE_ENV':'"development"'}});
 const fixture={records:[],orders:[{_id:'111111111111111111111111',orderNo:'DEMO',serviceName:'运动指导与复健训练',paymentStatus:'paid',status:'pending',totalUnits:4,usedUnits:0,expiresAt:'2027-01-01'}],templates:[],questions:[],responses:[],pushes:[],plans:[]};
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:req.url==='/style.css'?fs.readFileSync(path.join(root,'src/index.css')):'<html><meta charset="UTF-8"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,channel:process.env.REHAB_TEST_BROWSER || 'msedge'}).catch(e=>{server.close();throw e});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:fixture})}));
 try{
 const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base);await page.getByRole('button',{name:'首次运动能力评估',exact:true}).click();await page.getByText('测试项目与实际结果',{exact:true}).waitFor();assert.equal(await page.locator('.modal').count(),1);await page.getByRole('button',{name:'×',exact:true}).click();
 await page.goto(base+'?view=plans');await page.getByRole('button',{name:'制定运动服务方案',exact:true}).click();await page.getByRole('button',{name:'确认并发布方案',exact:true}).waitFor();await page.getByRole('button',{name:'×',exact:true}).click();await page.getByRole('button',{name:'安排预约',exact:true}).click();await page.getByText('预约时间',{exact:true}).waitFor();
 await page.goto(base+'?view=archive');await page.getByRole('button',{name:'运动指导与复健训练',exact:true}).click();await page.getByText('客户反馈与训练反应',{exact:true}).waitFor();
 await page.screenshot({path:path.join(root,'rehab-smoke.png'),fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: assessment, plan, booking and training forms render without browser errors');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
