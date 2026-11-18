# 医护安卓消息提醒：华为优先试用

## 现状

- 独立工作树 `pilot/staff-android-messages-20261118` 起自 `49cbb00a`；未部署后端或医护网页。
- 可安装的 `staff-android/build/jiayicare-staff-pilot-debug.apk` 使用嘉医汇 Logo，可登录、查看和回复客户消息，但没有后台系统推送或桌面角标。
- 2026-11-19 新生成 `staff-android/build/jiayicare-staff-huawei-pilot-debug.apk`（SHA-256 `D44A0A250178F646E37E044E79585E7734C2936AF407A26265B8A4515EC56056`），已含医护专属华为配置和“开启提醒”入口；尚需服务端接通与真机验证，不能将其当作通知已可送达。
- 已准备华为 Push Kit 专用 `push` 构建变体。服务端按客户当前所属医护、岗位、机构和有效登录设备定向发送简短提醒，并在华为通知里设置未读角标。打开 App 时每 15 秒同步未读数，退出登录时解绑设备。
- 默认关闭：需要 `STAFF_PUSH_ENABLED=true`、`STAFF_PUSH_START_AT`、`STAFF_HUAWEI_PUSH_CLIENT_ID`、`STAFF_HUAWEI_PUSH_CLIENT_SECRET`。启动时间以前的留言不补推。通知不含客户姓名和消息正文。第三方凭据只放服务端。

## 真机接通所需

1. 2026-11-18 已在现有企业华为项目下创建“嘉医汇医护”Android 手机应用，APP ID `119869889`，包名 `com.jiayicare.staff`；未上架。客户 App 的应用 ID 不适用于医护包。
2. 已在华为后台为该医护应用登记本机 Gradle 调试签名 SHA-256 指纹 `A5:23:F3:DE:D2:D0:23:5D:68:09:57:A1:CA:E3:5E:C0:4F:9C:FE:FB:2B:D3:88:CC:E4:4D:EE:DB:1A:FD:2C:73`，推送服务项目状态显示“正常”。用户提供的医护应用专属 `agconnect-services.json` 已核对 APP ID 和包名并放入 `staff-android/app/`，由 Git 忽略。工程默认使用上述医护 APP ID，也可通过 `STAFF_HUAWEI_APP_ID` 或 Gradle 参数覆盖。正式发布须使用妥善保管的正式签名证书。
3. 服务端私有环境填写该医护应用的 Client ID / Client Secret 和启动时间，部署经过复核的后端及医护网页后再开启开关。
4. 用合成客户和医护账号在华为真机验收后台通知、点按进入消息、已读角标归零、切换账号和退出后不再接收。其他安卓品牌暂不承诺系统通知或角标；现有企业微信提醒是独立链路，其线上启用状态须另核验。

## 验证边界

`node --test backend/test/staffPush.test.js` 4 项通过；`assemblePushDebug` 使用 AGConnect 插件 `1.9.6.300` 编译通过，APK 包名 `com.jiayicare.staff`、APP ID `119869889`、签名 SHA-256 与控制台一致，`push_configured=true`。`messageInbox.test.js` 在此隔离工作树因缺少 `sift` 依赖未能运行。后端和医护网页尚未部署，未做华为真机验收，因此不能声称通知或角标已送达。现有无推送演示包可继续试用消息操作。

华为文档：[Android 获取推送 Token](https://developer.huawei.com/consumer/en/doc/HMS-References/push-HmsInstanceId-cls/)、[服务端发送 API](https://developer.huawei.com/consumer/en/doc/HMS-References/push-sendapi/)、[角标](https://developer.huawei.com/consumer/en/doc/hmscore-guides/android-badging-0000001050042083/)、[SDK 集成](https://developer.huawei.com/consumer/en/doc/hmscore-guides/android-integrating-sdk-0000001050042006/)。
