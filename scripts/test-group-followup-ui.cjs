const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const {buildFixture}=require('../backend/test/helpers/serviceGroupFixture');
const {createDraft}=require('../backend/src/utils/groupFollowupDraft');
(async()=>{
  const f=buildFixture();
  await createDraft(f.models.ServiceGroup.rows[0],{text:'下周三联系我复查',sender:'测试发言者',sentAt:'2026-09-14T00:00:00Z',messageId:'synthetic-ui'});
  const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const browser=await chromium.launch({executablePath:process.env.TEST_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:430,height:932}});
    await context.addInitScript(staff=>{localStorage.setItem('jy_staff_token','synthetic-test');localStorage.setItem('jy_staff_info',JSON.stringify(staff));},f.staff.toObject());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/api/**',async route=>{
      const q=route.request(),u=new URL(q.url());
      if(u.pathname.includes('wecom-kf')) { await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:[]})});return; }
      const r=await fetch(`http://127.0.0.1:${server.address().port}${u.pathname}${u.search}`,{method:q.method(),headers:{authorization:'Bearer synthetic-test','content-type':'application/json'},body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer()});
      await route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});
    });
    await page.goto((process.env.TEST_STAFF_URL||'http://localhost:5188')+'/service-assistant');
    await page.getByLabel('当前服务群',{exact:true}).selectOption(f.ids.group);
    await page.getByRole('button',{name:'核对成员和日期'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'确认并安排跟进'}).isDisabled(),true);
    await page.getByRole('button',{name:'核对成员和日期'}).click();
    await page.locator('.sa-form select').first().selectOption(f.ids.patient);
    await page.getByLabel('跟进日期',{exact:true}).fill('2026-09-16');
    await page.getByRole('button',{name:'保存草稿',exact:true}).click();
    await page.getByRole('button',{name:'确认并安排跟进'}).click();
    await page.getByRole('button',{name:'开始处理',exact:true}).waitFor({timeout:5000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
    assert.equal(f.models.FollowUp.rows.length,1);
    assert.equal(String(f.models.FollowUp.rows[0].patientId),f.ids.patient);
    assert.deepEqual(errors,[]);
    await page.getByText('随访安排：下周三联系我复查',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:process.env.TEST_SCREENSHOT_PATH||'D:/Temp/jiayicare-group-followup-ui.png',fullPage:true});
    console.log('Mobile draft review and native follow-up confirmation passed; screenshot saved.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

