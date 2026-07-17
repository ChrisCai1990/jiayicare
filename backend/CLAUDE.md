# JiayiCare 后端说明

## 部署
- Railway 已连接 GitHub ChrisCai1990/jiayicare master 分支，push 后自动部署（约1-2分钟）
- 线上地址：https://mongodb-production-06f7.up.railway.app

## 路由总览
```
POST /api/auth/send-code       发送验证码
POST /api/auth/login           手机号登录
POST /api/auth/wechat          微信登录
POST /api/auth/wechat-mp       微信小程序登录（code2session，body:{code,userInfo?}，需配置 WECHAT_MP_APPID/WECHAT_MP_SECRET）

GET  /api/user/me              获取当前用户
PUT  /api/user/me              更新用户信息（用原生driver，见下）
GET  /api/user/dashboard       首页汇总数据
GET  /api/user/report          健康报告

GET  /api/records              健康记录列表 (?type=&days=&limit=)
POST /api/records              创建健康记录
DELETE /api/records/:id        删除记录

GET  /api/services             服务商城列表
POST /api/services/order       下单（支持 S1-S6 和 pkg_1y/6m/3m）

GET  /api/orders               我的订单
PATCH /api/orders/:id/cancel   取消订单
```

## 关键实现

### PUT /user/me（绕过 Mongoose 类型转换）
```js
await User.collection.updateOne({ _id: req.user._id }, { $set: updateData });
const user = await User.findById(req.user._id).select('-password');
```
原因：User.js 里 healthProfile 数组字段（allergies/medicalHistory等）在 Railway 旧版可能是 String 类型，
用 findByIdAndUpdate 会报 "Cast to string failed for Array"。

### 服务包目录
```js
const PACKAGE_CATALOG = [
  { id: 'pkg_1y', name: '年度服务包', duration: '12 个月', price: 3650, originalPrice: 5000 },
  { id: 'pkg_6m', name: '半年服务包', duration: '6 个月',  price: 1980, originalPrice: 2800 },
  { id: 'pkg_3m', name: '季度服务包', duration: '3 个月',  price: 1080, originalPrice: 1480 },
];
```

## User 模型 healthProfile
- 数组字段（Mixed）：allergies / medicalHistory / medications / familyHistory / surgeries
- 字符串字段：bloodType / drugAllergy / foodAllergy / pastHistory / medicHistory / surgeryHistory
- phone: required+unique（匹配 MongoDB 现有索引，不要改为 sparse）
- wechatOpenid: sparse+unique（网页/公众号授权登录用）
- wechatMpOpenid: sparse+unique（小程序 code2session 登录用，appid 不同于网页授权，openid 也不同，必须独立字段）

## 环境变量（Railway Variables）
- MONGODB_URI
- JWT_SECRET
- WECHAT_SECRET（微信网页授权登录用，配合 WECHAT_APPID）
- WECHAT_MP_APPID / WECHAT_MP_SECRET（小程序 code2session 登录用，未配置时 /auth/wechat-mp 返回503）
- FRONTEND_URL
