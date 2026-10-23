# GEO 退回、修订、复审

专业审核人退回后，原稿保留在 ContentReview 的 changes_requested 队列；不再留在专业审核待办。本人审核历史可打开全文、退回意见及版本差异。

自动检查使用已有 SSH 认证读取真实数据库，不依赖聊天通知，不开放匿名接口，不读取客户病历。仓库根目录执行：

```
python -X utf8 scripts/geo_revision_queue.py list
```

无退回稿时安静结束。存在退回稿时按 auditLog 最新 return 意见修订；缺意见、权限、连接或版本冲突必须明确报告，不能称没有退回稿。

每稿创建 UTF-8 JSON，包含 slug、原 expectedToken、sourceContent、changeSummary；title/summary 可选。保留原文医疗边界；临床实质变更需核对可靠来源，不扩写审核人未要求的医疗建议。

```
python -X utf8 scripts/geo_revision_queue.py resubmit --input <本地修订JSON>
python -X utf8 scripts/geo_revision_queue.py status --slug <稿件slug>
```

仅待修订状态及原始版本匹配才能原子保存原稿/新稿/退回意见/修订说明并回到审核链首岗；所有旧审批失效。重复或迟到请求失败，不覆盖人工改动。AI 无权审核或公开发布。若在健康顾问环节退回，修订后重新经过完整专业审核链，不能沿用旧正文的营养审批。

最终专业审核发布及之后文章重建，修订稿采用数据库中经审核的 title/summary/sourceContent，不拼回旧静态原稿。公共站点单独部署仍需核对已发布稿件数据库快照，不能以仓库旧稿覆盖线上审核版本。

定时任务执行位置为本地 Codex 自动化（不是服务器无人值守 AI）；本机离线、SSH权限失效会影响执行。不能承诺后台实时推送，不能在尚未验证读取和重新送审回执时宣称链路已上线。
