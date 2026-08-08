# 普通微信小程序支付上线清单

## 商户平台准备

1. 在微信支付商户平台开通“小程序支付”，将商户号与小程序 AppID `wx50062146332b1b20` 绑定。
2. 设置 API v3 密钥，下载商户 API 证书，并取得商户号、证书序列号和商户私钥。
3. 下载当前微信支付平台证书，从证书中导出平台公钥，用于验证支付与退款通知签名。
4. 在公众平台开通交易类小程序订单发货管理能力，并确认服务类订单允许使用的履约方式。

## 后端环境变量

```dotenv
WECHAT_MP_APPID=wx50062146332b1b20
WECHAT_PAY_MCH_ID=
WECHAT_PAY_SERIAL_NO=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_PRIVATE_KEY_PATH=/安全目录/apiclient_key.pem
WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH=/安全目录/wechatpay_platform_public_key.pem
WECHAT_PAY_NOTIFY_URL=https://jiaycare.com/api/payments/wechat/payment-notify
WECHAT_PAY_REFUND_NOTIFY_URL=https://jiaycare.com/api/payments/wechat/refund-notify
```

私钥、API v3 密钥和平台证书不得提交到 Git。服务器证书文件应限制为后端进程用户可读。

## 数据迁移

先在生产数据库备份后执行：

```powershell
node backend/src/scripts/migrateProductCommerceTypes.js
```

脚本会为存量商品补充履约类型、普通微信支付通道和 SKU。运行后必须在 Admin 逐项复核，尤其是包含配送与非配送混合规格的“医务代办服务”。

## 必测交易矩阵

- 正常支付：下单、微信付款、异步回调、订单变为已支付、生成履约单。
- 回调重复：同一支付通知重复发送，不重复扣健康基金、不重复使用优惠券、不重复发积分。
- 客户端中断：付款完成后关闭小程序，再进入订单页能通过查单恢复正确状态。
- 未支付取消：关闭微信支付单，订单关闭，不生成履约单。
- 用户退款申请：admin 审核、微信退款、退款通知、订单及履约关闭、积分/基金/优惠券回退。
- 退款通知重复：不重复回退任何权益。
- 配送服务、线下预约、远程咨询、长期计划分别验证微信订单履约上报。

## 上线门槛

- 未配置全部普通微信支付参数时，后端必须拒绝创建支付并给出配置缺失提示。
- 不允许通过客户端支付成功回调或 admin 手工按钮把普通微信支付订单改成已支付。
- 历史无微信交易号订单不得伪装成已退款；必须人工核对资金后独立处理。
