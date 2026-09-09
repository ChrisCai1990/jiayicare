const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canAccessPatient,
  canAccessGroup,
  parseCommand,
  fileMime,
  validTransition,
  checkedDate,
} = require("../src/utils/serviceGroupRules");
const {
  validSignature,
  seal,
  unseal,
} = require("../src/utils/serviceGroupBridge");
const { createHmac } = require("crypto");
test("AI待办必须有精确原文依据，不能直接写入个人档案", () => {
  const { summaryDraft } = require("../src/utils/serviceGroupRules");
  const value = summaryDraft(
    JSON.stringify({
      summary: "待核对预约",
      tasks: [
        {
          title: "核对时间",
          sourceQuote: "下周沟通",
          content: "与客户确认日期",
        },
        { title: "自行开药", sourceQuote: "不存在的原文" },
      ],
    }),
    "客户说下周沟通"
  );
  assert.equal(value.suggestions.length, 1);
  assert.equal(value.suggestions[0].title, "核对时间");
  assert.throws(() => summaryDraft("not json", ""));
});
test("档案访问必须同时满足机构、分配和未删除", () => {
  const staff = { _id: "a", role: "healthManager", tenantId: "t" };
  assert.equal(
    canAccessPatient(staff, { tenantId: "t", assignedHealthManager: "a" }),
    true
  );
  assert.equal(
    canAccessPatient(staff, { tenantId: "u", assignedHealthManager: "a" }),
    false
  );
  assert.equal(
    canAccessPatient(staff, { tenantId: "t", assignedHealthManager: "b" }),
    false
  );
  assert.equal(
    canAccessPatient(staff, {
      tenantId: "t",
      assignedHealthManager: "a",
      isDeleted: true,
    }),
    false
  );
  assert.equal(
    canAccessPatient({ ...staff, role: "superadmin" }, { tenantId: "u" }),
    false
  );
});
test("群成员关系不能绕过机构隔离", () => {
  const g = { tenantId: "t", owner: "a", staffIds: ["a", "b"] };
  assert.equal(canAccessGroup({ _id: "b", tenantId: "t" }, g), true);
  assert.equal(canAccessGroup({ _id: "c", tenantId: "t" }, g), false);
  assert.equal(
    canAccessGroup({ _id: "a", tenantId: "other", role: "superadmin" }, g),
    false
  );
});
test("仅明确前缀作为指令；不猜测妈妈是谁、不把聊天当授权", () => {
  assert.equal(parseCommand("请帮我归档"), null);
  assert.equal(parseCommand("客户说：嘉医汇归档：妈妈报告"), null);
  assert.deepEqual(parseCommand("嘉医汇待办：妈妈周三复查"), {
    kind: "task",
    text: "妈妈周三复查",
    requiresConfirmation: true,
  });
  assert.equal(parseCommand("嘉医汇归档：报告.pdf").kind, "archive");
});
test("按文件头验证格式，拒绝伪装PDF和可执行文件", () => {
  assert.equal(fileMime(Buffer.from("%PDF-1.7\n")), "application/pdf");
  assert.equal(fileMime(Buffer.from("<html>report.pdf</html>")), null);
  assert.equal(fileMime(Buffer.from("MZ")), null);
});
test("不能跳过草稿审核或把已取消事项复活", () => {
  assert.equal(validTransition("draft", "completed"), false);
  assert.equal(validTransition("draft", "planned"), true);
  assert.equal(validTransition("cancelled", "planned"), false);
  assert.equal(validTransition("completed", "in_progress"), false);
  assert.throws(() => checkedDate("not-a-date"));
  assert.throws(() => checkedDate("2026-02-31"));
});
test("桥接签名验证正文、时间和密钥，阻止篡改和过期请求", () => {
  const secret = "test-only-secret",
    timestamp = String(Date.now()),
    rawBody = '{"consent":true}';
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  assert.equal(validSignature({ secret, timestamp, signature, rawBody }), true);
  assert.equal(
    validSignature({ secret, timestamp, signature, rawBody: "{}" }),
    false
  );
  assert.equal(
    validSignature({
      secret,
      timestamp,
      signature,
      rawBody,
      now: Number(timestamp) + 301000,
    }),
    false
  );
  assert.equal(
    validSignature({ secret: "", timestamp, signature, rawBody }),
    false
  );
});
test("群消息加密可回读并检测篡改", () => {
  process.env.SERVICE_GROUP_MESSAGE_KEY = "ab".repeat(32);
  const value = seal("虚构测试消息");
  assert.equal(value.includes("虚构"), false);
  assert.equal(unseal(value), "虚构测试消息");
  const parts = value.split(".");
  parts[1] = "00".repeat(16);
  assert.throws(() => unseal(parts.join(".")));
  delete process.env.SERVICE_GROUP_MESSAGE_KEY;
});
