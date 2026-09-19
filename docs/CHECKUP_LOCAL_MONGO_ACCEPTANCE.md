# 体检准备：隔离数据库验收

## 当前结果（2026-09-20）

- 最新：经用户授权已安装官方7.0.34 Windows便携包，SHA256与官方校验文件一致；隔离实例绑定 `127.0.0.1:27134`，未安装系统服务，版本及standalone模式由测试强制验证。
- **真实MongoDB测试7项通过**（6项子测试+总测试），最新留存库 `jiayicare_checkup_test_8e192ab293b146e1a0ea7f7827cbf0c9`。20路派发只产生两岗任务，20路核销只扣1次，退款竞争拦截，缺索引/半成功恢复/历史状态保护通过。
- 模型插件原先引用未连接的默认连接，首次扩展核销测试出现延后同步告警；已将测试的默认连接也绑定同一随机隔离库，最新复跑无此告警。不是屏蔽插件，也未加载生产配置。
- 本机运行文件/数据留在 `C:/Users/huawei/Documents/codex/tmp/mongodb-7.0.34`，不进入仓库。验收后关闭进程，数据保留。生产未连接、未部署、自动派发开关未修改。
- 这证明局部数据库并发和恢复场景通过，不代表全业务闭环验收。Windows与生产Linux仍不同；真实续约、更正竞争、历史数据、浏览器多岗、服务全链路及绩效仍需验收。

以下为此前阻塞记录，已由上述本地安装解除：

- 扩大回归503项：502通过，1项既有失败，为 `checkupAdminClosureConfig.test.js` 的V15门诊迁移文本断言（此前已确认基线同样失败）。
- 真实MongoDB脚本默认跳过；显式运行已尝试，因 `127.0.0.1:27017` ECONNREFUSED 未能连接。**真实数据库验收未通过，不能将脚本存在或跳过视为成功。** 本次无测试数据/索引创建，无生产访问。
- 本机未发现mongod进程、命令或默认安装目录，也未发现Docker命令。需要准备隔离的本地MongoDB服务后再运行。

## 运行边界

脚本 `backend/test/integration/checkupDispatchMongo.test.js` 不读 `.env`，不使用应用 `MONGODB_URI`，只连接 `127.0.0.1`。每次使用随机 `jiayicare_checkup_test_...` 新库；真实业务库不可作为目标。只在该新库创建模型数据及派发唯一索引；测试后保留库名和数据供审阅，不自动删除数据库。

从仓库根目录、依赖已安装的PowerShell运行：

```powershell
$env:RUN_CHECKUP_LOCAL_MONGO_TEST = 'true'
$env:CHECKUP_TEST_MONGO_PORT = '27134'
node --test backend/test/integration/checkupDispatchMongo.test.js
Remove-Item Env:RUN_CHECKUP_LOCAL_MONGO_TEST
Remove-Item Env:CHECKUP_TEST_MONGO_PORT
```

`RUN_CHECKUP_LOCAL_MONGO_TEST` 只控制测试，不启用业务派发；不得把 `CHECKUP_PREPARATION_AUTO_ENABLED` 设置到生产来替代验收。

## 脚本覆盖

- 使用实际AnnualPlan/User/FollowUp模型schema、真实MongoDB读写和索引。
- 缺唯一索引拒绝写任务。
- 20个并发派发只生成两条岗位任务。
- 首岗写入后模拟中断，重试只补另一岗。
- 已完成/取消任务不重开。
- 20路具体服务核销只保存一次来源和次数；保留多次订单剩余额度。
- 退款状态变更后拒绝旧核销请求，即使时间戳不变。

服务期门槛为固定测试输入，**本脚本不替代真实续约权限、跨集合更正竞争、浏览器多岗位链路或服务/核销/绩效端到端验收**。这些仍需单独执行并记录。测试不触发AI、付款、客户推送、生产迁移或部署。
