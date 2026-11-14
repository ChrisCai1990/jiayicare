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

## 2026-11-14 客户真机反馈修复
- 客户截图确认小嘉实际回复存在固定介绍与生成介绍重复。新增生成结果介绍去重，纯招呼直接回复不调用模型，仍保留授权、成员、人工接管和最新消息核验；历史消息不改写。
- Taro服务群轮询从10秒调整2秒，增加请求中互斥，隐藏页面停轮询保持原逻辑。复杂问题仍有模型耗时，未承诺即时完成。
- 个人页v1.0.0（小程序）是写死文案，并非原生版本读取。H5改为嘉医汇健康管家，小程序标明渠道但不伪报版本；尚未实现原生构建号读取。
- 后端生产814ec7795f8已部署，包含同期专家协议更新，健康检查通过。8项AI接待/介绍测试通过。
- 苹果H5公开入口48文件校验及发布成功，index SHA256 d0090c8f0901bd5443010abc74f30e92bb66d5d501de1c1c247c5e0018c89d15；华为预发布H5同步，SHA256 eba0394dd199a48868f92dbfdcb7e13fb03b3043b663a049d48af8aef8cb4e4e。
- 小程序1.0.20261114.2已上传（1123669字节），包含13.3及14.1改动。两项构建产物测试及预检通过，未提交微信审核或正式发布。后续体验/提审以14.2为候选。
- 部署回执release-receipts/xiaojia-response-fix-final-20261114.log，上传回执xiaojia-response-mini-upload-20261114.json。真实手机响应耗时待客户验证。

## 2026-11-14 医护消息提醒与版本展示核验
- 医护服务群原仅列表内普通待回复文字，未纳入全局通知。新增独立reminders API按当前机构、有效客户、当前入群关系及监管权限统计全部待人工回复群，不受100条列表分页限制。
- 首页消息通知计数与侧栏消息通知包含待回复群；会员服务折叠标题、系统服务群入口显示数量，通知页提供直达待回复群入口，群卡片红色待人工回复。前台5秒更新，失败保留上次提醒。AI回复/查看对话不消除待回复，真人回复后刷新清除。
- 生产7da1d795279e3b03dae57764a0effe09b96e202d部署完成，健康检查通过；8项既有权限规则测试及JSX解析通过。线上静态页面使用拦截API的合成数据浏览器验证：群入口徽标、群卡片提醒及通知页跳转入口通过；未发送真实客户消息。回执release-receipts/staff-group-reminders-20261114.log；合成脚本staff-group-reminders-smoke.cjs。
- 版本展示：核对ios-push-fix-20261112的3c3f87f，app.json为1.0.2(5)，SharedH5App桥目前没有get-app-info或版本注入接口。不能以此源码信息代替每台设备的真实安装版本。需要下一原生安装包添加真实版本/构建号读取，并由H5展示；本轮尚未实现或提交该新安装包。

## 2026-11-14 输入区遮挡与客户未读入口修复
- 生产25423ccd73a已部署，医护聊天区改为视口内弹性高度，输入区不收缩、消息区独立滚动；打开群和发送后跟随最新消息，向上阅读历史不强制拉回。合成浏览器1440×900、1280×720、900×600、390×844发送按钮边界检查通过。
- 客户服务群通知原归系统通知，顶部群卡片无未读标记。新增群卡片未读数及最新通知预览、其他未读通知顶部入口。系统通知分类批量已读排除服务群消息，点击群通知不提前标已读；群消息接口只清除本客户本群本次返回消息对应的通知，并返回首条未读ID用于定位提示。新人工回复通知包含前120字预览和消息ID；历史通知正文不改写。
- 苹果H5已发布并校验48文件，index SHA256 c2bc751b8342df5cfcb07618912ba0de7d30b7714db4ce36cc3146607e8c9d44；华为预发布H5 537d96ec262677b4fb5e27ff9e721bf10c0a0a6a629aea8dd56ca95f5f348029。合成H5未读入口点击及首条未读提示验证通过，非真实账号验收。
- 小程序源码已同步，本轮尚未构建上传，新逻辑不包含在此前14.2开发版中。版本展示原生接口仍待下一安装包。
- 回执release-receipts/group-composer-unread-20261114.log；医护布局检查脚本staff-composer-smoke.cjs；App合成验证app-h5-push-release-20261112/group-unread-smoke.cjs。

## 2026-11-14 App消息被输入栏遮盖的后续修复
- 长对话合成复现确认：ScrollView实际scrollTop为0，首次scrollIntoView在loading占位尚未切换时设置，未定位到最新消息。改为loading结束且节点布局完成后nextTick定位并120ms补定位；H5直接计算滚动容器内偏移，小程序保留原生scrollTop/scrollIntoView。
- 消息区使用独立flex容器与100%高度ScrollView，输入区禁止收缩，100dvh限制视口。首次进入定位未读/最新，发送后及底部接收新消息跟随；向上阅读时保留位置。
- 25条长消息、390×844及393×650窗口验证最新消息底部在滚动区边界内；首条未读定位另跑同样布局验证。测试基于合成浏览器，需用户真机确认。
- 苹果H5线上48文件校验成功，index SHA256 198fa798a58bb01b8892c31a6ec31f278c23e2a41dd497fb7f6f2d270ab67c05；华为预发布H5 7db90314a4dd96b0c672321b1177197a79d7e9c6c729712535f22e34fda42e74。本轮不改后端，生产Git仍25423ccd73a；主仓源码56e8b0ed，小程序源码同步但未新增上传。
- 验证记录：app-h5-push-release-20261112/.tmp-occlusion-final.log与.tmp-unread-position.log；发布脚本scripts/deploy_group_scroll_20261114.py。

## 2026-11-14 用户端移除本人客户标签
- 用户端服务群本人消息仅显示姓名与时间；医护端仍显示客户，服务人员与AI角色保留。Taro及Expo源代码同步（3a673538），不改消息数据。
- 苹果H5已构建发布并校验48文件，index SHA256 94d20ea598c0794cef6684f9b7c49c1133964c2ea70bd3c7ac24a89f94c2e50a；华为预发布H5 934f5ca6dbd5f8a5ff0d633a966b1c4a23ba86af6004e4b36302f3a566d8e666。
- 生产已由其他任务推进至2d18af0a696（合作工作台）；本次只读检查差异后严格按原H5哈希发布独立页面目录，没有覆盖生产Git或医护代码。小程序及Expo源改动尚未独立发布。
