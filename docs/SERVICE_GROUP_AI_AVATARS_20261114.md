# 小嘉、服务群 AI 接待与头像（2026-11-14）

## 已确认规则
- 用户明确授权上线。小嘉采用三维女性卡通、青蓝色 V 领服务服，胸前为小号嘉医汇中英文与 ® 刺绣标识。正式名称“小嘉｜AI健康管家”，角色为健管专员的 AI 助手。
- 首次 AI 回复介绍：您好，我是小嘉，健管专员的AI助手，您的AI健康管家。
- 客户可从相册自选头像，不要求与微信头像一致；医护从个人中心上传。头像重编码为512×512 JPEG，输入限5MB JPG/PNG。
- 当前入群且仍负责客户的医护打开群时保持90秒接待状态，前台每30秒续期；离开后到期恢复。只读监管不续期。AI只对新客户文字消息异步回复，生成前后核验人工状态、授权、群成员版本、最新消息和客户存续。
- AI使用已有assistant授权和通义千问会话能力，标记senderType=ai；不会将AI回复记作人工已回复。客户可在群页“AI授权”管理授权。不发送健康档案、报告或联系方式。
- 每客户消息的AI回复用replyTo唯一稀疏索引去重。AI服务失败保留原客户消息，不假报发送失败；本版不补跑失败回复。
- 健管专员建群及健康顾问/营养师/就医专员作为团队负责人只读监管的规则延续。

## 实施与验证
- 主代码工作区：archive-medication-release-20261103。移动H5使用app-h5-push-release-20261112基线按差异合入，保留其通知设置、原生桥及角标。
- 头像、AI接待及权限15项专项通过；模拟AI结果测试，没有向真实客户发送测试消息。发布结果待回填。
- 小程序编译上传与微信审核/正式发布是独立步骤；服务器发布不代表小程序正式上线。

## 形象素材
使用内置image_gen工具。正式原图assets/brand/xiaojia-3d-final-20261114.png；线上头像assets/brand/xiaojia-avatar-20261114.jpg。
最终编辑提示词：
Edit this exact 3D cartoon female Jiayihui avatar, preserve her face, hair, expression, turquoise V-neck uniform, lighting and composition exactly. The only change is branding on viewer’s right chest: REMOVE the conspicuous raised ivory rectangular badge and its border entirely. Instead use a small tasteful directly embroidered two-line wordmark on the turquoise fabric: 嘉医汇® on top, JIA YI HUI below, with a tiny simplified brand emblem to its left. Embroidery in soft off-white thread, subtle tonal stitching that follows the cloth surface, NO background rectangle, NO plaque, NO border, NO shadow of a badge. Overall embroidered mark about half the current badge area, professional discreet uniform embroidery. Keep spelling exact and the ® visible at full size. This should feel naturally integrated into the garment rather than pasted on. No other changes.
