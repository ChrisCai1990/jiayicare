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
- 头像、AI接待及权限15项专项通过；模拟AI结果测试，没有向真实客户发送测试消息。
- 小程序编译上传与微信审核/正式发布是独立步骤；服务器发布不代表小程序正式上线。

## 形象素材
使用内置image_gen工具。正式原图assets/brand/xiaojia-3d-final-20261114.png；线上头像assets/brand/xiaojia-avatar-20261114.jpg。
最终编辑提示词：
Edit this exact 3D cartoon female Jiayihui avatar, preserve her face, hair, expression, turquoise V-neck uniform, lighting and composition exactly. The only change is branding on viewer’s right chest: REMOVE the conspicuous raised ivory rectangular badge and its border entirely. Instead use a small tasteful directly embroidered two-line wordmark on the turquoise fabric: 嘉医汇® on top, JIA YI HUI below, with a tiny simplified brand emblem to its left. Embroidery in soft off-white thread, subtle tonal stitching that follows the cloth surface, NO background rectangle, NO plaque, NO border, NO shadow of a badge. Overall embroidered mark about half the current badge area, professional discreet uniform embroidery. Keep spelling exact and the ® visible at full size. This should feel naturally integrated into the garment rather than pasted on. No other changes.

## 实际发布结果
- 生产代码：1cb090e16ee90e3e14b21434720cc25320369e64，合入生产并发更新后部署后端、staff、admin及Expo网页成功；跳过业务数据迁移。回执：工作区 release-receipts/xiaojia-avatar-deploy-20261114.log。
- 已安装苹果App对应H5已发布 https://app.joinwehealth.com/mobile-preview/ ，index SHA256：d13d1428cc413288dc64759bf390bbe054d0d3b616bea5415afa5dea189319da。保留原通知桥与角标代码，本轮未提交新原生安装包。
- 华为预发布H5同步 https://jiaycare.com/mobile-preview/ ，index SHA256：9cafaff83f0d05c242a346bedb1bdf35e41f9ed7de1453d8482ee18ce8d34d21。未在华为商店上线。
- 两个域名的小嘉JPEG资源公网核验一致：0129611eb0f15712d36bf546481a73de2c61b238abd7be538835ecae0450b2a2。AI配置存在；首次审计发现replyTo索引未自动创建，已显式补建并确认unique=true、sparse=true，未改写客户消息。
- 小程序开发版1.0.20261114.1上传成功，AppID wx50062146332b1b20，上传大小1123572字节。尚未提交微信审核、尚未正式发布。桌面浏览器操作遇到输入/截图采集超时，未完成公众平台操作；不能将开发版上传视为上线。
- H5两端构建完成；模拟数据浏览器群聊/头像编辑页面验收通过；小程序语法与真实React渲染2项测试、发布预检通过。未完成真实手机和真实账号AI对话验收，也未向客户发送测试消息。
- 核验回执：工作区release-receipts/xiaojia-avatar-audit-20261114.jsonl及xiaojia-avatar-index-20261114.jsonl；小程序上传回执xiaojia-mini-upload-20261114.json。
