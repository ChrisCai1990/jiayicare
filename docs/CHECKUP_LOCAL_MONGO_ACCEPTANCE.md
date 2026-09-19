# 体检准备：隔离数据库验收

## 当前结果（2026-09-20）

- 扩大回归503项：502通过，1项既有失败，为 `checkupAdminClosureConfig.test.js` 的V15门诊迁移文本断言（此前已确认基线同样失败）。
- 真实MongoDB脚本默认跳过；显式运行已尝试，因 `127.0.0.1:27017` ECONNREFUSED 未能连接。**真实数据库验收未通过，不能将脚本存在或跳过视为成功。** 本次无测试数据/索引创建，无生产访问。
- 本机未发现mongod进程、命令或默认安装目录，也未发现Docker命令。需要准备隔离的本地MongoDB服务后再运行。

## 运行边界

脚本 `backend/test/integration/checkupDispatchMongo.test.js` 不读 `.env`，不使用应用 `MONGODB_URI`，只连接 `127.0.0.1`。每次使用随机 `jiayicare_checkup_test_...` 新库；真实业务库不可作为目标。只在该新库创建模型数据及派发唯一索引；测试后保留库名和数据供审阅，不自动删除数据库。

从仓库根目录、依赖已安装的PowerShell运行：

```powershell
$env:RUN_CHECKUP_LOCAL_MONGO_TEST = 'true'
$env:CHECKUP_TEST_MONGO_PORT = '27017'
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

服务期门槛为固定测试输入，**本脚本不替代真实续约权限、跨集合更正竞争、浏览器多岗位链路或服务/核销/绩效端到端验收**。这些仍需单独执行并记录。测试不触发AI、付款、客户推送、生产迁移或部署。
