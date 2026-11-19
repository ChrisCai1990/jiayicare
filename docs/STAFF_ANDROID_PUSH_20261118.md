# 医护安卓消息提醒：华为优先试用

## 现状

- 独立工作树 `pilot/staff-android-messages-20261118` 起自 `49cbb00a`；后端及医护网页已通过发布提交 `10415922` 上线，生产健康检查和医护页面可访问。服务端尚未配置华为凭据和启用开关，故后台系统通知仍未生效。
- 可安装的 `staff-android/build/jiayicare-staff-pilot-debug.apk` 使用嘉医汇 Logo，可登录、查看和回复客户消息，但没有后台系统推送或桌面角标。
- 2026-11-19 更新的 `staff-android/build/jiayicare-staff-huawei-pilot-debug.apk` 为 `0.1.2`（SHA-256 `F462FCE7847812360B3A60405A6A1F3288E33F890CD55102A78688BCAFCC1F64`），已含医护专属华为配置和“开启提醒”入口。桌面图标改用嘉医汇 Logo 左侧方形品牌符号，保持比例；App 打开时不再依赖推送 Token 才查询未读数，并声明华为桌面角标权限。尚需服务端接通与真机验证，不能将其当作通知或角标已可送达。
- 已准备华为 Push Kit 专用 `push` 构建变体。服务端按客户当前所属医护、岗位、机构和有效登录设备定向发送简短提醒，并在华为通知里设置未读角标。打开 App 时每 15 秒同步未读数，退出登录时解绑设备。
- 默认关闭：需要 `STAFF_PUSH_ENABLED=true`、`STAFF_PUSH_START_AT`、`STAFF_HUAWEI_PUSH_CLIENT_ID`、`STAFF_HUAWEI_PUSH_CLIENT_SECRET`。启动时间以前的留言不补推。通知不含客户姓名和消息正文。第三方凭据只放服务端。

## 真机接通所需

1. 2026-11-18 已在现有企业华为项目下创建“嘉医汇医护”Android 手机应用，APP ID `119869889`，包名 `com.jiayicare.staff`；未上架。客户 App 的应用 ID 不适用于医护包。
2. 已在华为后台为该医护应用登记本机 Gradle 调试签名 SHA-256 指纹 `A5:23:F3:DE:D2:D0:23:5D:68:09:57:A1:CA:E3:5E:C0:4F:9C:FE:FB:2B:D3:88:CC:E4:4D:EE:DB:1A:FD:2C:73`，推送服务项目状态显示“正常”。用户提供的医护应用专属 `agconnect-services.json` 已核对 APP ID 和包名并放入 `staff-android/app/`，由 Git 忽略。工程默认使用上述医护 APP ID，也可通过 `STAFF_HUAWEI_APP_ID` 或 Gradle 参数覆盖。正式发布须使用妥善保管的正式签名证书。
3. 服务端私有环境填写该医护应用的 Client ID / Client Secret 和启动时间，部署经过复核的后端及医护网页后再开启开关。
4. 用合成客户和医护账号在华为真机验收后台通知、点按进入消息、已读角标归零、切换账号和退出后不再接收。其他安卓品牌暂不承诺系统通知或角标；现有企业微信提醒是独立链路，其线上启用状态须另核验。

## 验证边界

`node --test backend/test/staffPush.test.js` 4 项通过；`messageInbox.test.js` 借用匹配依赖后 6 项通过。`assemblePushDebug` 使用 AGConnect 插件 `1.9.6.300` 编译通过，APK 包名 `com.jiayicare.staff`、APP ID `119869889`、签名 SHA-256 与控制台一致，`push_configured=true`。后端和医护网页已部署，但推送开关关闭、未做华为真机验收，因此不能声称通知或角标已送达。`adb devices` 当时未列出已连接手机。

华为文档：[Android 获取推送 Token](https://developer.huawei.com/consumer/en/doc/HMS-References/push-HmsInstanceId-cls/)、[服务端发送 API](https://developer.huawei.com/consumer/en/doc/HMS-References/push-sendapi/)、[角标](https://developer.huawei.com/consumer/en/doc/hmscore-guides/android-badging-0000001050042083/)、[SDK 集成](https://developer.huawei.com/consumer/en/doc/hmscore-guides/android-integrating-sdk-0000001050042006/)。
