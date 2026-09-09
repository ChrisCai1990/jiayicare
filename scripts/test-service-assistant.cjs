// Browser + real route handlers with synthetic in-memory fixtures only. All API traffic is intercepted.
const { chromium } = require("playwright-core");
const { buildFixture } = require("../backend/test/helpers/serviceGroupFixture");
const fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const fixture = buildFixture();
  const server = fixture.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const executable =
    process.env.TEST_CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await chromium.launch({
    executablePath: executable,
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
    });
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await context.addInitScript((staff) => {
      localStorage.setItem("jy_staff_token", "synthetic-test");
      localStorage.setItem("jy_staff_info", JSON.stringify(staff));
    }, fixture.staff.toObject());
    await context.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const reply = await fetch(base + url.pathname + url.search, {
        method: req.method(),
        headers: {
          authorization: "Bearer synthetic-test",
          "content-type": req.headers()["content-type"] || "application/json",
        },
        body: ["GET", "HEAD"].includes(req.method())
          ? undefined
          : req.postDataBuffer(),
      });
      await route.fulfill({
        status: reply.status,
        contentType: "application/json",
        body: await reply.text(),
      });
    });
    await page.goto(
      (process.env.TEST_STAFF_URL || "http://localhost:5174") +
        "/service-assistant"
    );
    await page
      .getByLabel("当前服务群", { exact: true })
      .selectOption(fixture.ids.group);
    await page
      .getByRole("heading", { name: "演示家庭服务群", exact: true })
      .waitFor();
    await page
      .getByLabel("当前服务对象", { exact: true })
      .selectOption(fixture.ids.patient);
    await page.getByRole("button", { name: "新建待办", exact: true }).click();
    await page.getByLabel("标题", { exact: true }).fill("确认家庭医生沟通时间");
    await page
      .getByLabel("沟通内容与下一步")
      .fill("联系客户确认时间，并记录反馈。");
    await page.getByLabel("跟进日期").fill("2026-09-12");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await page
      .getByRole("heading", { name: "确认家庭医生沟通时间", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "确认并安排跟进" }).click();
    await page.getByRole("button", { name: "开始处理", exact: true }).waitFor();
    if (fixture.models.FollowUp.rows.length !== 1)
      throw new Error("Follow-up not persisted");
    await page.getByRole("button", { name: "服务记录", exact: true }).click();
    await page
      .getByRole("button", { name: "新建服务记录", exact: true })
      .click();
    await page.getByLabel("标题", { exact: true }).fill("客户沟通记录");
    await page
      .getByLabel("沟通内容与下一步")
      .fill("已确认本次需求，等待客户补充日期。");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await page.getByRole("button", { name: "确认记录", exact: true }).click();
    await page.getByText("已关联嘉医汇服务记录", { exact: false }).waitFor();
    await page.getByRole('button',{name:'群通知',exact:true}).click();
    await page.getByRole('button',{name:'新建群通知',exact:true}).click();
    await page.getByLabel('标题',{exact:true}).fill('预约协调提醒');
    await page.getByLabel('准备发给客户的文案').fill('您好，方便时请确认沟通时间。');
    await page.getByRole('button',{name:'保存草稿',exact:true}).click();
    await page.getByRole('button',{name:'确认记录',exact:true}).click();
    await page.getByRole('button',{name:'标记已手动通知',exact:true}).waitFor();
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'标记已手动通知',exact:true}).click();
    await page.getByText('人工确认已通知',{exact:true}).waitFor();
    if(fixture.models.FollowUp.rows[0].status!=='planned')throw new Error('Notification incorrectly completed a task');
    const output =
      process.env.TEST_ARTIFACT_DIR ||
      path.join(__dirname, "../artifacts/service-assistant");
    fs.mkdirSync(output, { recursive: true });
    await page.getByRole("button", { name: "待办", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(output, "desktop.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.goto(
      (process.env.TEST_STAFF_URL || "http://localhost:5174") +
        "/service-assistant?embedded=1"
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByLabel("当前服务群", { exact: true })
      .selectOption(fixture.ids.group);
    await page
      .getByRole("heading", { name: "演示家庭服务群", exact: true })
      .waitFor();
    await page.screenshot({
      path: path.join(output, "mobile.png"),
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    if (overflow) throw new Error("Mobile horizontal overflow");
    await page.getByLabel("快捷指令").fill("嘉医汇记录：明天联系客户");
    await page.getByRole("button", { name: "整理为草稿" }).click();
    await page.getByLabel("沟通内容与下一步").waitFor();
    if (
      (await page.getByLabel("沟通内容与下一步").inputValue()) !==
      "明天联系客户"
    )
      throw new Error("Command preview mismatch");
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('button',{name:'新建服务群',exact:true}).click();
    await page.getByLabel('服务群名称',{exact:true}).fill('第二个演示家庭');
    await page.getByLabel('添加家庭成员',{exact:true}).fill('演示');
    await page.getByRole('button',{name:'演示客户甲 · 139****0001',exact:true}).click();
    await page.getByPlaceholder('关系，如本人 / 母亲').fill('本人');
    await page.getByRole('button',{name:'保存绑定',exact:true}).click();
    await page.getByRole('heading',{name:'第二个演示家庭',exact:true}).waitFor();
    if(fixture.models.ServiceGroup.rows.length!==2)throw new Error('Group binding not persisted');
    fixture.models.ServiceGroup.rows[0].chatId = 'wr_synthetic_current';
    let releaseSignature;
    const signatureGate = new Promise(resolve=>{releaseSignature=resolve;});
    await page.route('**/api/staff/service-groups/wecom-signature', async route => {
      await signatureGate;
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{}})});
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator,'userAgent',{get:()=> 'wxwork synthetic'});
      window.syntheticChat='wr_synthetic_current';
      window.wx={error:()=>{},ready:fn=>{window.sdkReady=fn;},config:()=>window.sdkReady(),agentConfig:p=>p.success(),invoke:(method,p,cb)=>cb(method==='getContext'?{err_msg:'getContext:ok',entry:'group_chat_tools'}:{chatId:window.syntheticChat})};
    });
    await page.reload();
    await page.getByText('正在读取当前群的绑定关系…',{exact:true}).waitFor();
    if(await page.getByText('从一个服务群开始',{exact:true}).count()) throw new Error('Loading must not suggest a new binding');
    releaseSignature();
    await page.getByRole('heading',{name:'演示家庭服务群',exact:true}).waitFor();
    if(await page.getByLabel('当前服务群',{exact:true}).count()) throw new Error('Sidebar must not offer group switching');
    if(await page.getByRole('button',{name:'新建服务群',exact:true}).count()) throw new Error('Bound sidebar must not create another group');
    await page.screenshot({path:path.join(output,'locked-sidebar.png'),fullPage:true});
    const tabsTop = await page.getByRole('navigation',{name:'服务功能'}).evaluate(el=>el.getBoundingClientRect().top);
    if(tabsTop > 340) throw new Error('Sidebar top area is too tall');
    await page.getByRole('button',{name:'群设置',exact:true}).click();
    await page.getByLabel('服务群名称',{exact:true}).fill('未保存的家庭名称');
    const revisitResponse = page.waitForResponse(r=>r.url().endsWith('/api/staff/service-groups') && r.request().method()==='GET');
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await revisitResponse;
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='重新识别当前群')?.disabled);
    if(await page.getByLabel('服务群名称',{exact:true}).inputValue() !== '未保存的家庭名称') throw new Error('Same-chat revisit discarded settings');
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByText('连接状态与重试',{exact:true}).click();
    await page.evaluate(()=>{window.syntheticChat='wr_synthetic_unbound';});
    await page.getByRole('button',{name:'重新识别当前群',exact:true}).click();
    await page.getByRole('heading',{name:'绑定个人 / 家庭服务群',exact:true}).waitFor();
    if(await page.getByRole('heading',{name:'演示家庭服务群',exact:true}).count()) throw new Error('Unbound chat must not display prior household');
    await page.getByLabel('服务群名称',{exact:true}).fill('尚未保存的绑定');
    await page.getByRole('button',{name:'重新识别当前群',exact:true}).click();
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='重新识别当前群')?.disabled);
    if(await page.getByLabel('服务群名称',{exact:true}).inputValue() !== '尚未保存的绑定') throw new Error('Same unbound chat discarded binding draft');
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      JSON.stringify({
        passed: true,
        checks: [
          "task draft and native confirmation",
          "service record native writeback",
          "desktop render",
          "390px layout",
          "explicit command preview",
          "notification does not complete task",
          "new household binding",
          "same-chat revisit preserves settings and binding drafts",
          "current WeCom group auto-selected and locked; unbound chat clears previous household",
        ],
        artifacts: output,
      })
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
