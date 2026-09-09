// Server-to-server boundary for an administrator-operated, consent-aware archive collector.
// This endpoint is NOT a WeCom webhook and does not pretend to implement the Finance SDK.
const router = require("express").Router();
const Group = require("../models/ServiceGroup");
const Message = require("../models/ServiceGroupMessage");
const { validSignature, seal } = require("../utils/serviceGroupBridge");
const {
  parseCommand,
  checkedDate,
  fileMime,
} = require("../utils/serviceGroupRules");
const { createHash } = require("crypto");
router.post("/messages", async (req, res) => {
  try {
    if (process.env.SERVICE_GROUP_ARCHIVE_ENABLED !== "true")
      return res
        .status(503)
        .json({ success: false, message: "会话存档接入未启用" });
    if (
      !validSignature({
        secret: process.env.SERVICE_GROUP_BRIDGE_SECRET,
        timestamp: req.get("x-jy-timestamp"),
        signature: req.get("x-jy-signature"),
        rawBody: req.rawBody || "",
      })
    )
      return res
        .status(401)
        .json({ success: false, message: "签名无效或过期" });
    const b = req.body;
    if (
      typeof b.chatId !== "string" ||
      typeof b.messageId !== "string" ||
      typeof b.sender !== "string" ||
      typeof b.text !== "string" ||
      b.text.length > 20000 ||
      !b.text.trim() ||
      b.messageId.length > 200 ||
      b.sender.length > 200 ||
      b.consent !== true ||
      !b.sentAt
    )
      return res
        .status(400)
        .json({ success: false, message: "消息字段或会话授权不完整" });
    const tenantId = process.env.SERVICE_GROUP_BRIDGE_TENANT_ID || null;
    const g = await Group.findOne({
      chatId: b.chatId,
      tenantId,
      archiveConsent: true,
    });
    if (!g)
      return res
        .status(403)
        .json({ success: false, message: "该群未授权接入" });
    const sentAt = checkedDate(b.sentAt);
    if (
      sentAt.getTime() > Date.now() + 300000 ||
      sentAt.getTime() < Date.now() - 30 * 86400000
    )
      return res
        .status(400)
        .json({ success: false, message: "仅接收最近30天消息" });
    const command = parseCommand(b.text);
    if (await Message.findOne({ groupId: g._id, messageId: b.messageId }))
      return res.json({
        success: true,
        data: { duplicate: true, execution: "awaiting_staff_confirmation" },
      });
    const sealedText = seal(b.text);
    let attachment;
    if (b.file) {
      if (
        typeof b.file.base64 !== "string" ||
        b.file.base64.length > 12 * 1024 * 1024 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(b.file.base64)
      )
        return res
          .status(400)
          .json({
            success: false,
            message: "桥接文件最大9MB，须使用base64正文",
          });
      const buffer = Buffer.from(b.file.base64, "base64"),
        mime = fileMime(buffer);
      if (!mime)
        return res
          .status(400)
          .json({ success: false, message: "不支持的文件格式" });
      const stored = await require("../utils/oss").uploadBuffer(
        buffer,
        mime,
        "service-group-staging"
      );
      attachment = {
        name: String(b.file.name || "群报告").slice(0, 200),
        ossKey: stored.key,
        mimeType: stored.mimeType,
        size: stored.size,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    }
    let result;
    try {
      result = await Message.updateOne(
        { groupId: g._id, messageId: b.messageId },
        {
          $setOnInsert: {
            groupId: g._id,
            messageId: b.messageId,
            sender: b.sender,
            sentAt,
            sealedText,
            attachment,
            commandKind: command?.kind || "",
            expiresAt: new Date(sentAt.getTime() + 30 * 86400000),
          },
        },
        { upsert: true, runValidators: true }
      );
      if (!result.upsertedCount && attachment)
        await require("../utils/oss").deleteFile(attachment.ossKey);
    } catch (error) {
      if (attachment)
        await require("../utils/oss").deleteFile(attachment.ossKey);
      throw error;
    }
    await Group.updateOne(
      { _id: g._id },
      { $set: { lastMessageAt: new Date() } }
    );
    res.json({
      success: true,
      data: {
        duplicate: !result.upsertedCount,
        commandDetected: !!command,
        execution: "awaiting_staff_confirmation",
      },
    });
  } catch (e) {
    res
      .status(e.code === 11000 ? 409 : e.status || 500)
      .json({
        success: false,
        message: e.status ? e.message : "消息接入失败，请管理员检查配置",
      });
  }
});
module.exports = router;
