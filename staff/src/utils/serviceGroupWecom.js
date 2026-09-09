import { serviceGroupAPI } from "../api";
let loading;
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
        wx.error(() => {
          clearTimeout(timer);
          reject(new Error("企微域名或应用授权未通过"));
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
            fail: () => {
              clearTimeout(timer);
              reject(new Error("企微客户联系权限未通过"));
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
    const timer = setTimeout(() => reject(new Error("企微响应超时")), 15000);
    wx.invoke(method, payload, (r) => {
      clearTimeout(timer);
      String(r.err_msg || r.errMsg || "").endsWith(":ok")
        ? resolve(r)
        : reject(new Error("企微操作未完成，请核对当前群和应用权限"));
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
