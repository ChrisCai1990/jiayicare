# 群消息持续采集与随访草稿

2026-09-14：用户授权接入已有授权群，自动生成草稿，人工确认后进入正式随访。

## 数据流与边界

官方 Finance SDK → 解密 → 本机构已绑定且 archiveConsent=true 的群 → 官方 check_room_agree 同意状态 → 签名桥接收件 → 本地规则生成 ServiceGroupEntry 草稿 → 员工核对 → FollowUp。

- SDK 每批最多20条，单个进程每15秒继续拉取，以 MongoDB WecomArchiveCursor 保存序号；数据库租约避免并发拉取，失败不跨过未完成消息。接收端按群和消息ID去重；草稿按发送人、中国日期和规范化原文去重。未授权群、非发送事件、未同意的消息跳过；以后授权不自动补入此前跳过的数据。
- 仅同步已有群授权；不替客户或员工同意。要求群内外部联系人均同意，且消息发生于同意之后；状态缺失或接口失败不放行。
- 文字、9MB以内的PDF/JPG/PNG/WEBP可接入。附件在私有OSS短时暂存，沿用人工确认成员、类别的归档流程；不自动OCR、不自动审核。其他类型不下载，支持类型的超限文件只保留查看企微原件的提示。
- 跟进筛选在服务器本地按明确的随访、复查、报告解读、联系等表达进行，不调用外部AI，不保证覆盖所有自然语言表达。一般闲聊不建任务；症状或用药只产生医护核对草稿，不提供诊疗建议，也不替代急症处置。
- 不根据发送人或群名猜测患者；草稿患者始终留空。只提取明确完整年月日，模糊日期保留原文，须人工确定。
- 引用原消息的变更可更新尚未人工编辑的草稿；无明确引用时生成变更核对草稿，不猜测对应事项，不修改正式随访。不会自动回复客户。
- 自动草稿确认前必须选择本群成员、有效日期、本群服务团队负责人；后端同时检查跟进创建与编辑权限。确认后使用草稿稳定ID创建 FollowUp，重试不重复建任务。

## 运行配置（值只放服务器安全配置）

- WECOM_CORP_ID、WECOM_ARCHIVE_SECRET：企业身份和存档专用凭据。
- WECOM_ARCHIVE_KEY_DIR：存档SDK、公私钥目录。默认 `/var/lib/jiayicare/wecom-archive`；版本1用 private.pem，后续版本用 private-vN.pem，不能覆盖旧版本。
- SDK：sdk/libWeWorkFinanceSdk_C.so，来自官方文档链接的 Linux x86 v3 20250205 包；Python3 ctypes 通过私有管道与Node协作，不记录明文。
- SERVICE_GROUP_ARCHIVE_ENABLED=true、WECOM_ARCHIVE_COLLECTOR_ENABLED=true：启用接收及持续采集。
- SERVICE_GROUP_FOLLOWUP_DRAFT_ENABLED=true：启用本地规则草稿生成，与外部AI总结开关无关。
- SERVICE_GROUP_BRIDGE_SECRET、SERVICE_GROUP_MESSAGE_KEY：签名和入库加密，复用已配置项。
- SERVICE_GROUP_BRIDGE_TENANT_ID：明确机构；缺省只匹配 tenantId:null 的既有群。

工作目录为 backend，运行 `node scripts/wecom-archive-worker.js`；`--once` 可跑一批用于验收。生产由PM2管理，进程名 `jiayicare-wecom-archive`。关闭上述采集开关并停止该进程即可停采，不删除已收件消息。采集状态以最后成功时间、错误码和游标为准；配置存在不代表持续采集在线。

## 验证

- 单元与路由测试覆盖否定句、闲聊、临床转人工、日期不猜测、同意边界、跨群过滤、断点重试、草稿失败恢复、患者权限及正式随访幂等。
- 合成手机页面回归：自动草稿显示 → 选择成员与日期 → 保存 → 确认 → 正式随访回读；不得往生产写入合成健康记录。
- SDK实测已返回9条真实消息，全部解密成功，版本1，含7条群消息。该结果只是只读测试；持续采集部署结果另记。

官方依据：[获取会话内容](https://developer.work.weixin.qq.com/document/path/91774)、[会话同意状态](https://developer.work.weixin.qq.com/document/path/91782)。

## 生产启用验收（2026-09-14）

- 功能提交 `12245c0f` 已按 GitHub→本地 bundle→生产的标准流程部署，19项相关测试、医护端构建和430px手机页面合成回归通过；后端健康检查正常。
- `jiayicare-wecom-archive` 已作为独立PM2进程启动并保存，现有2个授权群保持原范围，采集及本地规则草稿开关开启。
- 首批9条中有2条非群消息，其余7条来自已绑定但 archiveConsent=false 的群，全部按范围跳过。游标推进到9，无消息写入、无自动草稿；不将“SDK能读到”混同于“允许写入此群”。后续只处理新到的授权群消息。
- 尚未用生产授权群的新消息验证实际生成草稿；完整确认链路已用合成数据在本地路由与手机页面验证，生产没有写入测试随访。
- 部署脚本现会重启已经注册的采集进程，避免后续更新后仍运行旧代码；没有注册采集进程时不自动创建。
