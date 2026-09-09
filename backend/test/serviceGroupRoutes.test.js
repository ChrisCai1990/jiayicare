const test = require("node:test"),
  assert = require("node:assert/strict");
const { buildFixture } = require("./helpers/serviceGroupFixture");
test("服务群路由：权限、草稿确认、原系统回读、重复上传", async (t) => {
  const f = buildFixture(),
    server = f.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${
      server.address().port
    }/api/staff/service-groups`,
    gid = f.ids.group;
  const request = async (path, method = "GET", body, headers = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        authorization: "Bearer synthetic-test",
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
          ? body
          : JSON.stringify(body),
    });
    return { status: r.status, ...(await r.json()) };
  };
  assert.equal(
    (await request("/" + gid, "GET", undefined, { "x-test-other": "true" }))
      .status,
    403
  );
  assert.equal(
    (await request("/" + gid, "GET", undefined, { authorization: "" })).status,
    401
  );
  assert.equal(
    (
      await request("/" + gid + "/entries", "POST", {
        kind: "task",
        patientId: f.ids.outsider,
        title: "越权",
        dueAt: "2026-09-12",
        requestKey: "no",
      })
    ).status,
    400
  );
  const draft = await request("/" + gid + "/entries", "POST", {
    kind: "task",
    patientId: f.ids.patient,
    title: "核对预约时间",
    content: "联系客户确认",
    dueAt: "2026-09-12",
    requestKey: "task-1",
  });
  assert.equal(draft.status, 201);
  assert.equal(f.models.FollowUp.rows.length, 0);
  assert.equal(
    (
      await request("/" + gid + "/entries", "POST", {
        kind: "task",
        title: "核对预约时间",
        dueAt: "2026-09-12",
        requestKey: "task-1",
      })
    ).data._id,
    draft.data._id
  );
  const path = `/${gid}/entries/${draft.data._id}`;
  assert.equal(
    (
      await request(path, "PATCH", {
        version: 0,
        status: "completed",
        result: "收到",
      })
    ).status,
    400
  );
  const confirmed = await request(path, "PATCH", {
    version: 0,
    status: "planned",
  });
  assert.equal(confirmed.status, 200);
  assert.equal(f.models.FollowUp.rows.length, 1);
  assert.equal(f.models.FollowUp.rows[0].status, "planned");
  assert.equal(
    (await request(path, "PATCH", { version: 0, status: "planned" })).status,
    409
  );
  f.models.FollowUp.rows[0].status = "completed";
  const detail = await request("/" + gid);
  assert.equal(detail.data.entries[0].status, "completed");
  const record = await request("/" + gid + "/entries", "POST", {
    kind: "record",
    patientId: f.ids.patient,
    title: "沟通结果",
    content: "已核对预约日期",
    requestKey: "record-1",
  });
  assert.equal(
    (
      await request(`/${gid}/entries/${record.data._id}`, "PATCH", {
        version: 0,
        status: "confirmed",
      })
    ).status,
    200
  );
  assert.equal(f.models.ServiceRecord.rows.length, 1);
  assert.equal(f.models.ServiceRecord.rows[0].type, "group_service");
  assert.equal(
    (await request(`/${gid}/summary`, "POST", { sourceText: "测试" })).status,
    409
  );
  const upload = () => {
    const data = new FormData();
    data.append(
      "file",
      new Blob(["%PDF-1.7\nsynthetic-only"], { type: "application/pdf" }),
      "fixture.pdf"
    );
    data.append("patientId", f.ids.patient);
    data.append("title", "测试报告");
    data.append("documentCategory", "physical_exam");
    return data;
  };
  const first = await request(`/${gid}/reports`, "POST", upload());
  assert.equal(first.status, 201);
  assert.equal(first.data.status, "待解析");
  const second = await request(`/${gid}/reports`, "POST", upload());
  assert.equal(second.data.duplicate, true);
  assert.equal(f.getUploadCount(), 1);
  assert.equal(f.models.MedicalReport.rows[0].audit_status, "unaudited");
  assert.equal(f.models.MedicalReport.rows[0].aiStatus, "none");
  const bad = new FormData();
  bad.append("file", new Blob(["MZ executable"]), "fake.pdf");
  bad.append("patientId", f.ids.patient);
  bad.append("title", "fake");
  bad.append("documentCategory", "physical_exam");
  assert.equal((await request(`/${gid}/reports`, "POST", bad)).status, 400);
  const cancelled = await request("/" + gid + "/entries", "POST", {
    kind: "task",
    patientId: f.ids.patient,
    title: "不再跟进",
    dueAt: "2026-09-12",
    requestKey: "cancel-1",
  });
  assert.equal(
    (
      await request(`/${gid}/entries/${cancelled.data._id}`, "PATCH", {
        version: 0,
        status: "cancelled",
      })
    ).status,
    200
  );
  assert.equal(f.models.FollowUp.rows.length, 1, "取消草稿不应创建正式待办");
  const group = f.models.ServiceGroup.rows[0];
  group.archiveConsent = true;
  process.env.SERVICE_GROUP_ARCHIVE_ENABLED = "true";
  process.env.SERVICE_GROUP_BRIDGE_SECRET = "fixture-bridge-only";
  process.env.SERVICE_GROUP_MESSAGE_KEY = "ab".repeat(32);
  process.env.SERVICE_GROUP_BRIDGE_TENANT_ID = f.ids.tenant;
  t.after(() => {
    for (const k of [
      "SERVICE_GROUP_ARCHIVE_ENABLED",
      "SERVICE_GROUP_BRIDGE_SECRET",
      "SERVICE_GROUP_MESSAGE_KEY",
      "SERVICE_GROUP_BRIDGE_TENANT_ID",
    ])
      delete process.env[k];
  });
  group.chatId = "fixture-chat";
  const payload = {
    chatId: "fixture-chat",
    messageId: "file-message-1",
    sender: "fixture-sender",
    sentAt: new Date().toISOString(),
    consent: true,
    text: "嘉医汇归档：演示客户的报告",
    file: {
      name: "fixture.pdf",
      base64: Buffer.from("%PDF-1.7\nmessage-fixture-only").toString("base64"),
    },
  };
  const raw = JSON.stringify(payload),
    timestamp = String(Date.now());
  const signature = require("crypto")
    .createHmac("sha256", process.env.SERVICE_GROUP_BRIDGE_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  const send = () =>
    fetch(
      `http://127.0.0.1:${
        server.address().port
      }/api/integrations/service-groups/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jy-timestamp": timestamp,
          "x-jy-signature": signature,
        },
        body: raw,
      }
    ).then((r) => r.json());
  assert.equal((await send()).data.execution, "awaiting_staff_confirmation");
  assert.equal((await send()).data.duplicate, true);
  assert.equal(f.models.ServiceGroupMessage.rows.length, 1);
  const inbox = await request(`/${gid}/messages`);
  assert.equal(inbox.data[0].text, payload.text);
  const archived = await request(`/${gid}/archive-message`, "POST", {
    messageId: inbox.data[0]._id,
    patientId: f.ids.patient,
    title: "群报告",
    documentCategory: "physical_exam",
  });
  assert.equal(archived.status, 201);
  assert.equal(f.models.MedicalReport.rows.length, 2);
  assert.equal(
    f.models.MedicalReport.rows[1].sourceSha256,
    require("crypto")
      .createHash("sha256")
      .update(Buffer.from(payload.file.base64, "base64"))
      .digest("hex")
  );
  process.env.SERVICE_GROUP_AI_ENABLED = "true";
  group.aiConsent = true;
  const ai = require("../src/utils/ai");
  const originalChat = ai.chat;
  ai.chat = async () =>
    JSON.stringify({
      summary: "客户希望核对复诊安排",
      tasks: [
        {
          title: "确认复诊时间",
          content: "联系客户明确日期",
          sourceQuote: "想确认复诊安排",
        },
      ],
    });
  t.after(() => {
    ai.chat = originalChat;
    delete process.env.SERVICE_GROUP_AI_ENABLED;
  });
  const summary = await request(`/${gid}/summary`, "POST", {
    sourceText: "客户：想确认复诊安排",
    requestKey: "summary-1",
  });
  assert.equal(summary.status, 200);
  assert.equal(summary.data.status, "draft");
  assert.equal(summary.data.suggestions.length, 1);
  assert.equal(
    f.models.FollowUp.rows.length,
    1,
    "AI仅生成候选，不自动建正式待办"
  );
  const count=f.models.ServiceGroupEntry.rows.length;
  const handoff=await request(`/${gid}/workbench-draft`,'POST',{kind:'handoff'});
  assert.equal(handoff.status,200);assert.equal(handoff.data.kind,'summary');
  assert.equal(f.models.ServiceGroupEntry.rows.length,count,'预览不自动保存');
  assert.equal((await request(`/${gid}/workbench-draft`,'POST',{kind:'reply'})).status,400);
  assert.equal((await request(`/${gid}/workbench-draft`,'POST',{kind:'reply',patientId:f.ids.outsider})).status,400);
  assert.equal((await request(`/${gid}/workbench-draft`,'POST',{kind:'reply',patientId:f.ids.patient})).status,200);
  f.models.User.rows[0].familyLinks=[{linkedUser:f.ids.outsider,relation:'家属'}];
  assert.deepEqual((await request('/family-candidates/'+f.ids.patient)).data,[],'无权关联成员不泄露');
  f.models.User.rows[1].assignedHealthManager=f.ids.staff;
  const family=await request('/family-candidates/'+f.ids.patient);
  assert.equal(family.data.length,1);assert.equal(family.data[0].relation,'家属');
});
