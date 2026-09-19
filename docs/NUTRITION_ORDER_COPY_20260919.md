# 营养实物订单话术与消费积分核对

## 基线及范围

基于已上线 `c40eb3df`（小程序 1.0.168），调整后端付款确认消息和健康规划师后续 AI 上下文；App、小程序共用，无需修改小程序页面。未修改商品配置、库存、履约流程、支付金额、历史消息或账户余额。

线上只读核对：“营养改变生活”属于 `nutrition_intervention`，但仍配置 `offline_service`、不配送；用户已明确该商品包含仓库发出的营养代餐。部分 `supplement_supply` 产品也沿用线下服务标记。不能把同属营养干预分类的评估、咨询全部改成发货话术。

## 新话术

已收到您的“{商品名称}”订单，支付已确认。本订单涉及的营养产品由仓库安排发货。如尚未确认收货信息，请补充收货人、联系电话和详细收货地址；已提供的信息无需重复填写。具体发货安排以工作人员确认为准，如有配送方面的需求，可以直接在这里留言。

匹配已支付、非退款订单中的：明确商品“营养改变生活”、订单快照 `supplement_supply`、配送型 `nutrition_intervention`；无工作流快照的历史订单只在配送类型且名称明确营养实物时兼容。保留代配药专用话术优先级；预约、评估、咨询不受影响。

AI 后续对话沿用该业务上下文，只收集缺失收货信息，不要求预约时间，不声称系统地址已修改、仓库已出库或已发货，不编造库存/物流/送达日期，不自行给出营养用量或疗效承诺。消息去重键不变，不重发或覆盖历史订单消息。真正的仓库待发货状态仍依赖履约配置，本次不把话术修改等同于仓库流程已改造。

## 消费积分核对

用户要求：标价 10000、基金抵扣 1000、实付 9000，应按 9000 计算购买积分/健康基金。

当前小程序微信支付链路已经符合这一口径：微信确认 `Payment.amount` 写入 `Order.paidAmount`，`awardOrderPoints` 只按 `paidAmount` 计分，不读取商品价，也不二次扣基金/券。

2026-09-19 对本次反馈订单只读核对：标价 6800、基金抵扣 1、微信确认实付 6799、消费新增 6799 积分；随后兑换流水为 6800 积分兑 68 元，包含账户既有零散积分。线上规则为每 100 分兑换 1 元；不能把一次累计兑换的金额全部视为本单新赠金额。本次不调整比例、累计兑换规则或历史余额。

新增回归测试覆盖 10000-1000、基金加优惠券、全额抵扣不赠、重复调用及 6799 与已有积分累计兑换。人工登记旧订单的后台路径另有直接带入标价的遗留逻辑，不作为本次真实微信支付流水的原因；未在本次话术修复中改动人工收款和历史账目。

## 发布状态

本地执行 `node --test backend/test/orderCashRewardBasis.test.js backend/test/orderPlannerConversation.test.js backend/test/nutritionPlannerContext.test.js backend/test/aiMessageFallbackPrompt.test.js backend/test/orderAiIntake.test.js backend/test/orderSupplementArchive.test.js backend/test/pointsHealthFund.test.js backend/test/singleProductPushPayment.test.js backend/test/healthFundAllocation.test.js backend/test/healthFundProductRule.test.js`，40 项通过，0 失败。

本文件记录候选修复，尚未部署。上线后仅新生成的订单确认消息使用新话术，历史消息保持原样。实际仓库发货及真机对话仍需业务验收。
