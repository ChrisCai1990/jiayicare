# Android 测试包整合记录

基线：GitHub master `3ff83cb41f9999d08ee52292bef459eb3885430a`。
整合目录：`C:/Users/huawei/Documents/codex/app-preview-20260930`。

本次仅整合已审 App 修复及依赖锁：登录同意、移除固定演示登录/无依据宣传、原生支付承接（预览禁用）、家庭服务概览、Expo运行依赖及正式图标。健康基金修复已在基线中。后端保持该主干原样。

验证：按根锁文件安装App依赖成功；19项App测试通过；Android Metro发布导出成功（Hermes资源包3.94MB）；git diff检查通过。原生编译、安装和真实用户流程尚未验证。

预览配置：APK，非developmentClient；API为https://app.joinwehealth.com/api；微信支付开关false。此包用于基础流程测试，不作为支付验收或商店正式提审包。

环境：C盘空间不足导致首次EAS工具下载失败，本次工具缓存及临时目录改为D:/codex-app-build-temp。不删除用户文件。此前EAS免费Android额度提示10月1日恢复，当前构建结果须以实际EAS命令为准。

范围冻结：先交付可安装Android测试包，不再增加新功能。阻断启动/登录/上传/订单的缺陷才进入本轮。微信审批与支付联调、Apple会员激活及iOS真机、最终商店资料另行验收，不阻塞Android基础预览。
