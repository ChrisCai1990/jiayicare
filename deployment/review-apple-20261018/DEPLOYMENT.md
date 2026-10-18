## 2026-10-18 23:45 充值后恢复并启用审核文本AI（最新）

用户回复“已充值”。首次请求仍403 AccessDenied.Unpurchased；百炼主账号刷新后欠费限制提示消失，随后固定Qwen-Plus-2025-12-01真实合成请求成功。又通过临时回环HTTP服务调用线上同一套路由与认证：专用合成账号未同意时只保存消息、同意后真实模型选择WHO BMI来源并生成带AI标识的回复、撤回后下一条消息不调用AI；账号主体与并发修订号防护验证通过。测试创建的合成主体、会话、授权、消息均已清理；永久预算账本保留，累计保守预留60分（0.60元），不是确认实际账单。

已开启隔离审核服务的文本AI（REVIEW_EXTERNAL_SERVICES_ENABLED=true、REVIEW_AI_ENABLED=true），ASR仍false。累计AI/语音共1000分、每天25次、2026-10-26 00:00 +08:00到期关闭均保留。回执review-text-ai-enabled.json；备份/var/backups/jiayicare-review-ai-enabled-1792338291。生产后端仍4b8860eede2981bc82faa5592e937d44cfa80c8a，普通H5、安装包和商店提交未改变。

iOS演示首页说明已改为文本AI须进入后单独授权，并在公网页面刷新确认。截图review-text-ai-enabled.png。审核H5自己的隐私政策已包含第三方说明。此次是后端HTTP验证，不是真机或浏览器点击授权的完整验收，也没有把预置演示消息当作真实输出。真实HTTP回执review-http-after-recharge.json；独立探针provider-probe.json。

下一步：用户可在审核体验中以合成资料完成页面授权和文字聊天，并做iPad真机验收。语音NLS配置/材料、普通生产候选合并审计、其他健康路径及历史建议来源仍待完成；不能据此重新提审或声称三端正式版全部更新。用户仍负责最终提交。

以下为充值前历史记录：

# 2026-10-18 隔离审核环境部署

只发布隔离审核后端和两个 `/mobile-preview/review/` 路径；未发布普通用户环境、App包或重新提审。

后端部署源提交 c8717009（包含31bf4185、fbf321fb），18文件哈希校验、健康200、未登录同意接口401。备份 `/var/backups/jiayicare-apple-review-1792336449`。生产提交保持4b8860eede2981bc82faa5592e937d44cfa80c8a。

审核后端17项测试通过；真实隔离Mongo验证并发预算和重启后不重置，未同意/撤回在发送前拒绝。固定模型qwen-plus-2025-12-01；AI和语音共享永久1000分上限，每天25次，失败保守占用、不自动重试。三个常驻真实服务开关保持false，NLS未配置。

三次仅合成文本真实供应商请求均失败，最后HTTP403 AccessDenied.Unpurchased；累计保守预留30分，不代表实际扣费。百炼账号1176控制台同时明确显示INSUFFICIENT_AVAILABLE_QUOTA、账号已欠费。用户已回复“我处理后通知你”；状态改变前停止探针。Key权限未扩大，明文仅在审核服务器0600环境文件。

## 审核H5

两个域名jiaycare.com、app.joinwehealth.com审核入口均验证成功，普通入口哈希未改变。最终102个构建资源；第三方AI说明从误放的服务说明移至隐私政策5.5，公网浏览器已确认。

- 最终备份：`/var/backups/jiayicare-review-h5-1792337410`
- 构建zip SHA256：`62fb9d47c9abe8340ce8209de9b9053d2c0dc72163d8dbc8434a64a3a44e3ad3`
- 两域名index SHA256：`ce3d6ed6bc704bc52be486b630a630e540adf311f5380f117d2b241bed0fec42`
- 本地源码zip SHA256：`8da5b8c04b3c30112836191d3a65f91942c65339ceba229d843038e98b0935be`

H5源来自保留原生桥接等特性的独立候选，完整源码与manifest仅存本地 `release/apple-review-20261018/review-h5-source.zip` / `review-h5-source-manifest.json`；未把其尚未逐项审计的额外差异合入生产。部署回执、探针结果、构建日志及截图也在该release目录，不含明文Key。

后续：用户处理欠费后核验服务开通与一次有界调用；真实授权、真实输出来源和iPad验收仍未完成。普通环境需保留最新家庭关系等改动并单独审计合并；待所有材料、验收齐备后上传，由用户提交。不声称Apple问题全部解决。
