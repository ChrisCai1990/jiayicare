import { serviceGroupAPI } from "../api";
let loading;
// Only expose SDK status fields, never full responses (which may contain IDs).
function sdkError(stage, response = {}) {
  const status = String(response?.err_msg || response?.errMsg || "无状态信息")
    .replace(/https?:\/\/\S+/gi, "[链接已隐藏]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[标识已隐藏]")
    .slice(0, 180);
  const code = response?.errCode ?? response?.errcode;
  const shape = stage === "getCurExternalChat" ? `；群标识${validChatId(response?.chatId) ? "有效" : "缺失或无效"}` : "";
  return new Error(`企微 ${stage} 失败：${status}${Number.isInteger(Number(code)) && code !== undefined ? `（代码 ${Number(code)}）` : ""}${shape} [诊断v3]`);
}
function validChatId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(value);
}
function sdkSucceeded(method, result) {
  if (!result || typeof result !== "object") return false;
  const messages = [result.err_msg, result.errMsg].filter(v => v != null && String(v).trim() !== "");
  const codes = [result.errcode, result.errCode].filter(v => v != null);
  if (codes.some(v => String(v) !== "0")) return false;
  if (messages.some(v => !String(v).endsWith(":ok"))) return false;
  if (method === "getCurExternalChat") return validChatId(result.chatId);
  // Sending still requires explicit success; never infer delivery from payload.
  return messages.length > 0;
}
export async function connectWecom() {
  if (!/wxwork/i.test(navigator.userAgent))
    throw new Error("请在企业微信聊天工具栏中打开此页面");
  if (!loading)
    loading = (async () => {
      if (!window.wx)
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://res.wx.qq.com/open/js/jweixin-1.2.0.js";
          script.onload = resolve;
          script.onerror = () => reject(new Error("企微组件加载失败"));
          document.head.append(script);
        });
      const { data: c } = await serviceGroupAPI.post("/wecom-signature", {
        url: window.location.href.split("#")[0],
      });
      const wx = window.wx;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("企微初始化超时")),
          15000
        );
        wx.error((r) => {
          clearTimeout(timer);
          reject(sdkError("config", r));
        });
        wx.ready(() =>
          wx.agentConfig({
            corpid: c.corpId,
            agentid: c.agentId,
            timestamp: c.timestamp,
            nonceStr: c.nonceStr,
            signature: c.agentSignature,
            jsApiList: ["getContext", "getCurExternalChat", "sendChatMessage"],
            success: () => {
              clearTimeout(timer);
              resolve();
            },
            fail: (r) => {
              clearTimeout(timer);
              reject(sdkError("agentConfig", r));
            },
          })
        );
        wx.config({
          beta: true,
          debug: false,
          appId: c.corpId,
          timestamp: c.timestamp,
          nonceStr: c.nonceStr,
          signature: c.signature,
          jsApiList: ["getContext", "getCurExternalChat", "sendChatMessage"],
        });
      });
      return wx;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}
function invoke(wx, method, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`企微 ${method} 响应超时 [诊断v2]`)), 15000);
    wx.invoke(method, payload, (r) => {
      clearTimeout(timer);
      sdkSucceeded(method, r)
        ? resolve(r)
        : reject(sdkError(method, r));
    });
  });
}
export async function currentWecomGroup() {
  const wx = await connectWecom();
  const context = await invoke(wx, "getContext");
  if (context.entry !== "group_chat_tools")
    throw new Error("请从客户服务群的聊天工具栏进入");
  const result = await invoke(wx, "getCurExternalChat");
  if (!result.chatId) throw new Error("未取得当前群标识");
  return result.chatId;
}
export async function shareToWecomGroup(chatId, content) {
  if (!chatId || (await currentWecomGroup()) !== chatId)
    throw new Error("当前企微群与所选家庭不一致，已停止发送");
  return invoke(await connectWecom(), "sendChatMessage", {
    msgtype: "text",
    text: { content },
    enterChat: true,
  });
}
