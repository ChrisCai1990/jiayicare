async function sendCode(phone, code) {
  if (!process.env.ALIYUN_SMS_KEY_ID || !process.env.ALIYUN_SMS_KEY_SECRET
    || !process.env.ALIYUN_SMS_SIGN || !process.env.ALIYUN_SMS_TEMPLATE)
    throw new Error('短信服务暂不可用');
  const Dysmsapi = require('@alicloud/dysmsapi20170525');
  const OpenApi = require('@alicloud/openapi-client');
  const client = new Dysmsapi.default(new OpenApi.Config({ accessKeyId: process.env.ALIYUN_SMS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_SMS_KEY_SECRET, endpoint: 'dysmsapi.aliyuncs.com' }));
  const response = await client.sendSms(new Dysmsapi.SendSmsRequest({ phoneNumbers: phone,
    signName: process.env.ALIYUN_SMS_SIGN, templateCode: process.env.ALIYUN_SMS_TEMPLATE,
    templateParam: JSON.stringify({ code }) }));
  if (response.body.code !== 'OK') throw new Error('短信发送失败');
}
module.exports = { sendCode };
