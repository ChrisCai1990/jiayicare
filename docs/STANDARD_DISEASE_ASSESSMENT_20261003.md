# 健康问题标准分级自动识别

医护端健康画像现在将“报告中的标准分类”和“健康评分扣分档位”分开展示。系统仅从最新、已完成健管专员与健康顾问双重审核的报告项目中识别明确写出的标准类别；证据不足、标准体系不明、多病灶类别不同或新报告未审核时显示“待评估”。识别结果只作医护核对建议，不自动改变健康评分。

## 当前支持

| 健康问题标签 | 报告须明确写出的体系 | 依据 |
| --- | --- | --- |
| 甲状腺结节或囊肿 | C-TIRADS、ACR TI-RADS／TR | [C-TIRADS 2020](https://pubmed.ncbi.nlm.nih.gov/32827126/)、[ACR TI-RADS](https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/Reporting-and-Data-Systems/TI-RADS) |
| 乳腺或乳房相关标签 | BI-RADS | [ACR BI-RADS](https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/Reporting-and-Data-Systems/BI-RADS) |
| 肺结节或磨玻璃相关标签 | Lung-RADS | [ACR Lung-RADS v2022](https://www.acr.org/-/media/ACR/Files/RADS/Lung-RADS/Lung-RADS-2022.pdf) |

仅有“TI-RADS 4”等未注明体系的结果不会按 ACR 或 C-TIRADS 猜测。Lung-RADS 是肺癌筛查 CT 的报告体系；普通诊断 CT 未明确使用该体系时不会被自动分类。HPV 阳性、冠心病、血脂异常等不会套用上述影像体系，也不会由疾病标签直接推断轻中重。HPV 需依据检测类型、基因型及后续结果按[WHO 筛查分流指南](https://www.who.int/publications/b/82716)评估。

## 医护确认和历史评分

分级建议显示报告、检查日期、原文和标准链接。该会员的健康顾问或超管可以确认；服务端重新读取报告并核对报告修订号和标准类别，确认人、时间、来源与既往确认写入历史。报告或类别变化后，页面将旧确认标为失效。

规则在代码中有独立版本号。指南或识别逻辑更新时，维护人员应核对原始指南、修订适用范围和测试样例，递增规则版本后发布。旧确认会自动显示为失效，待医护重新核对；历史确认及当时使用的规则版本保留，不静默改写。当前不会自动联网抓取指南或批量重分级。

旧 `chronicDiseaseSeverity` 仍是健康评分的内部扣分档位。未设置时，既有评分引擎仍按一级扣分；页面不再把这种默认值称作“轻症”。标准类别与扣分档位之间尚无经过临床确认的映射规则，因此本次不自动改分、不批量改历史客户数据。若要扩展到血压、糖尿病、慢性肾病等，需要逐病种确定适用人群、必需指标、时间窗口、指南版本和临床审核人，再增加规则。
