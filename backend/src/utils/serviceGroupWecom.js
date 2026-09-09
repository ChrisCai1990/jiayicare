const { createHash, randomBytes } = require("crypto");
let cached;
async function api(path, token) {
  const response = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/${path}${
      path.includes("?") ? "&" : "?"
    }access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(12000) }
  );
  const result = await response.json();
  if (!response.ok || result.errcode)
    throw new Error(`企微接口失败（${result.errcode || response.status}）`);
  return result;
}
async function signature(url) {
  const {
    WECOM_CORP_ID: corpId,
    WECOM_AGENT_ID: agentId,
    WECOM_APP_SECRET: secret,
    WECOM_SIDEBAR_ORIGIN: origin,
  } = process.env;
  if (!corpId || !agentId || !secret || !origin)
    throw Object.assign(new Error("企微侧边栏尚未配置"), { status: 503 });
  const target = new URL(url);
  if (
    target.origin !== origin ||
    target.username ||
    target.password ||
    !target.pathname.startsWith("/service-assistant")
  )
    throw Object.assign(new Error("侧边栏地址不受信任"), { status: 400 });
  target.hash = "";
  if (!cached || cached.until < Date.now()) {
    const response = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(
        corpId
      )}&corpsecret=${encodeURIComponent(secret)}`,
      { signal: AbortSignal.timeout(12000) }
    );
    const token = await response.json();
    if (!response.ok || token.errcode || !token.access_token)
      throw new Error("企微应用认证失败");
    const [corp, agent] = await Promise.all([
      api("get_jsapi_ticket", token.access_token),
      api("ticket/get?type=agent_config", token.access_token),
    ]);
    cached = {
      corp: corp.ticket,
      agent: agent.ticket,
      until:
        Date.now() +
        Math.max(
          0,
          Math.min(token.expires_in, corp.expires_in, agent.expires_in) - 300
        ) *
          1000,
    };
  }
  const nonceStr = randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = (ticket) =>
    createHash("sha1")
      .update(
        `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${target.href}`
      )
      .digest("hex");
  return {
    corpId,
    agentId,
    nonceStr,
    timestamp,
    signature: sign(cached.corp),
    agentSignature: sign(cached.agent),
  };
}
async function chatName(chatId, userId) {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(chatId || '') || !userId)
    throw Object.assign(new Error('请先绑定本人企微账号后读取群名'), {status:403});
  const {WECOM_CORP_ID:corpId,WECOM_APP_SECRET:secret}=process.env;
  if(!corpId || !secret)throw Object.assign(new Error('企微尚未配置'),{status:503});
  const tokenResponse=await fetch('https://qyapi.weixin.qq.com/cgi-bin/gettoken?'+new URLSearchParams({corpid:corpId,corpsecret:secret}),{signal:AbortSignal.timeout(12000)});
  const token=await tokenResponse.json();
  if(!tokenResponse.ok || token.errcode || !token.access_token)throw new Error('企微应用认证失败');
  const response=await fetch('https://qyapi.weixin.qq.com/cgi-bin/externalcontact/groupchat/get?access_token='+encodeURIComponent(token.access_token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,need_name:0}),signal:AbortSignal.timeout(12000)});
  const result=await response.json();
  if(!response.ok || result.errcode)throw new Error('无法读取企微群名称，请核对客户群接口权限');
  const chat=result.group_chat;
  // Do not expose another group's metadata just because a caller knows its chat ID.
  if(!chat || (chat.owner!==userId && !chat.member_list?.some(m=>m.type===1 && m.userid===userId)))
    throw Object.assign(new Error('当前员工不在该群，无法读取群名'),{status:403});
  const name=typeof chat.name==='string'?chat.name.trim().slice(0,120):'';
  if(!name)throw new Error('企微未返回群名，请手动填写');
  return {name};
}
module.exports = { signature, chatName };
