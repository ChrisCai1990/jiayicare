# 已安装 App H5 健康报告更新（2026-11-12）

已安装 iPhone App 使用的页面入口是 `https://app.joinwehealth.com/mobile-preview/`，由 Taro H5 提供。`https://jiaycare.com/` 的 Expo 网页构建是另一处入口；只更新后者不会改变此 App 的页面。

本轮以 2026-11-11 已上线的 App H5 基线 `334a8cce` 为源，保留地区选择、基金展示和审核隔离适配，补入健康报告指标卡折叠曲线、血压时间默认提交时刻及手动补录。原生 iOS 通知等能力仍须新安装包。

生产普通 H5 入口从 SHA256 `3c10e0c261d3c32aa9a33c23254f408505b10e5230cbe4dbeedb53cece883432` 更新为 `83c40ed0014b496aba02245a68f9cadacdca3963373d8eed973ce0eb77153830`。构建产物 47 个文件均经发布脚本核验；公网入口哈希与服务器文件一致，H5 和后端健康接口均返回 200。旧入口备份为 `/var/backups/jiayicare-app-h5-report-20261112-83c40ed0014b/previous-index.html`。审核 H5 路径未改动。

这次是线上页面更新，没有生成或提交新的 iOS 安装包，也没有生成 Android APK/AAB。真实手机重新打开后的显示仍需设备验收。
