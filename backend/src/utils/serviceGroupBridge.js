const {
  createHmac,
  timingSafeEqual,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} = require("crypto");
function validSignature({
  secret,
  timestamp,
  signature,
  rawBody,
  now = Date.now(),
}) {
  if (
    !secret ||
    !/^\d{10,13}$/.test(String(timestamp)) ||
    !/^[a-f0-9]{64}$/.test(signature || "")
  )
    return false;
  if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}
function encryptionKey() {
  const key = Buffer.from(process.env.SERVICE_GROUP_MESSAGE_KEY || "", "hex");
  if (key.length !== 32) throw new Error("群消息加密密钥未配置");
  return key;
}
function seal(text) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    body.toString("base64"),
  ].join(".");
}
function unseal(value) {
  const [iv, tag, body] = value.split(".");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "hex")
  );
  cipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    cipher.update(Buffer.from(body, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
module.exports = { validSignature, seal, unseal };
