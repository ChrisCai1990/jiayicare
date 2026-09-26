from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


OUTPUT = Path(r"C:\Users\huawei\Documents\codex\deploy-care-flow-20260923\docs\WONCA_2027_SUBMISSION_PACK.docx")


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_cell_border(cell, color="D9D9D9", size="6"):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)


def set_cell_margins(cell, top=110, start=110, bottom=110, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn("w:" + margin))
        if node is None:
            node = OxmlElement("w:" + margin)
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    elem = OxmlElement("w:tblHeader")
    elem.set(qn("w:val"), "true")
    tr_pr.append(elem)


def write_cell(cell, value, bold=False, color=None, size=8.6):
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    run = p.add_run(str(value))
    run.bold = bold
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    set_cell_margins(cell)
    set_cell_border(cell)


def add_table(doc, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.autofit = False
    header = table.rows[0]
    set_repeat_table_header(header)
    for index, text in enumerate(headers):
        cell = header.cells[index]
        write_cell(cell, text, bold=True, color="FFFFFF", size=8.6)
        set_cell_shading(cell, "173F35")
        if widths:
            cell.width = widths[index]
    for row_index, row_data in enumerate(rows):
        row = table.add_row()
        for index, text in enumerate(row_data):
            cell = row.cells[index]
            write_cell(cell, text, size=8.4)
            if row_index % 2 == 1:
                set_cell_shading(cell, "F3F7F5")
            if widths:
                cell.width = widths[index]
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def add_text(doc, text, style=None, bold_lead=None):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(5)
    if bold_lead and text.startswith(bold_lead):
        r = p.add_run(bold_lead)
        r.bold = True
        p.add_run(text[len(bold_lead):])
    else:
        p.add_run(text)
    return p


def add_bullets(doc, items, numbered=False):
    style = "List Number" if numbered else "List Bullet"
    for item in items:
        p = doc.add_paragraph(style=style)
        p.paragraph_format.space_after = Pt(2)
        p.add_run(item)


def add_checklist(doc, items):
    for item in items:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.25)
        p.paragraph_format.space_after = Pt(2)
        p.add_run("☐  " + item)


def set_font(run, name="Aptos", east_asia="Microsoft YaHei"):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:ascii"), name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), name)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), east_asia)


def configure_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Aptos"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.15

    title = doc.styles["Title"]
    title.font.name = "Aptos Display"
    title._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    title.font.size = Pt(23)
    title.font.bold = True
    title.font.color.rgb = RGBColor(0, 0, 0)
    title.paragraph_format.space_after = Pt(8)

    for name, size in (("Heading 1", 15), ("Heading 2", 11.5)):
        style = doc.styles[name]
        style.font.name = "Aptos"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(12)
        style.paragraph_format.space_after = Pt(5)


def add_footer(doc):
    section = doc.sections[0]
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(5)
    r = p.add_run("WONCA APRC 2027 Abstract Submission Pack  |  26 September 2026")
    r.font.size = Pt(8)
    r.font.color.rgb = RGBColor(100, 100, 100)


def main():
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.65)
    section.left_margin = Cm(1.8)
    section.right_margin = Cm(1.8)
    configure_styles(doc)
    add_footer(doc)

    p = doc.add_paragraph(style="Title")
    p.add_run("WONCA APRC 2027 摘要投稿材料包")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run("AI 辅助健康管理闭环的基层医疗实施研究")
    r.bold = True
    r.font.size = Pt(12)
    r.font.color.rgb = RGBColor(23, 63, 53)
    add_text(doc, "本材料包用于准备 WONCA Asia Pacific Regional Conference 2027 的摘要投稿。建议以正在进行的实施研究形式，评估 AI 在专业人员终审下如何把已审核健康报告转化为可追溯、有责任人的基层医疗随访。材料刻意不包含任何虚构患者结果或临床有效性主张。")
    add_table(doc, ["会议", "WONCA Asia Pacific Regional Conference 2027"], [
        ["会议日期", "2027 年 4 月 22 至 25 日，香港"],
        ["推荐类别", "T  Telemedicine Technology and AI"],
        ["投稿截止", "2026 年 11 月 15 日 星期日 23:59 香港时间"],
        ["官方投稿页", "https://www.woncaaprc2027hk.com/index/abstract/call-for-abstracts"],
        ["格式", "英文；标题最多 20 词；正文最多 300 词；Introduction Methods Results Conclusion；最多 3 个关键词"],
    ], [Cm(3.0), Cm(13.5)])

    doc.add_heading("1 推荐投稿定位", level=1)
    add_text(doc, "推荐类别：T Telemedicine Technology and AI。大会该类别欢迎研究数字健康、人工智能、临床有效性、真实世界整合、实施挑战、伦理和患者及临床人员体验。")
    add_text(doc, "拟定题目：An Auditable Human-in-the-Loop AI Workflow for Report-Triggered Follow-up in Primary Care。题目共 13 词，符合上限。", bold_lead="拟定题目：")
    add_text(doc, "研究问题：在真实健康管理服务中，一个由 AI 起草、专业人员审核、任务流转与结果回写组成的可审计工作流，能否安全、可行地把已审核健康报告转化为有责任人、可闭环的基层医疗随访？")
    add_text(doc, "研究定位：关注实施可行性、工作流质量和安全治理；不将 AI 表述为诊断工具、处方工具或家庭医生的替代者。")

    doc.add_heading("2 可直接提交的英文摘要", level=1)
    abstract_parts = [
        ("Introduction", "Health reports often identify follow-up needs, but converting verified findings into timely, accountable primary-care actions is labour-intensive and vulnerable to omission. We designed an auditable human-in-the-loop artificial intelligence (AI) workflow that supports, rather than replaces, clinical and health-management judgement."),
        ("Methods", "We are conducting a prospective mixed-methods implementation pilot in an integrated health-management service. For consecutively enrolled adults with an eligible, professionally reviewed health report, the system extracts only source-grounded follow-up suggestions into a draft. A health adviser reviews, edits, approves, or rejects each draft before any formal follow-up is issued. The system records source provenance, reviewer actions, ownership, due dates, linked service progress, and closure evidence. Primary implementation outcomes are the proportion of eligible reports with an approved or documented-rejected follow-up decision, time from report review to decision, and the proportion of issued actions with a named owner. Secondary outcomes include draft acceptance, modification and rejection rates; duplicate or overdue actions; action-closure rate; staff time; and patient-reported task burden. Safety monitoring records unsupported suggestions, inappropriate urgency, privacy/permission incidents, and attempted actions before human approval. Quantitative data will be summarised descriptively; staff and patient feedback will undergo rapid thematic analysis."),
        ("Results", "Data collection is in progress. We will report recruitment, workflow completion, reviewer decisions, safety events, and implementation barriers, stratified by report type and follow-up pathway. No clinical effectiveness or diagnostic-performance claim will be made."),
        ("Conclusion", "This pilot evaluates whether source-grounded AI with mandatory human review and end-to-end auditability can make report-triggered follow-up more reliable without transferring clinical accountability to AI. Findings will inform a scalable, safety-oriented model for technology-enabled primary care."),
    ]
    for label, body in abstract_parts:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(5)
        r = p.add_run(label + "  ")
        r.bold = True
        p.add_run(body)
    add_text(doc, "Keywords: artificial intelligence; primary care; follow-up")
    add_text(doc, "摘要正文约 262 词（不含标题和关键词）。提交前请以投稿系统计数器复核。", bold_lead="摘要正文约 262 词")

    doc.add_heading("3 提交前必须确认的内容", level=1)
    add_table(doc, ["字段", "提交前填写或确认", "责任人"], [
        ["Presenting author", "姓名、职称、邮箱；必须为研究作者并在接受后完成会议注册", "项目负责人"],
        ["Authors and affiliations", "只列实际参与研究设计、临床审核或数据分析者；建议包含家庭医生或基层医疗合作者", "作者组"],
        ["Study setting", "机构名称、城市或地区、服务模式", "项目负责人"],
        ["Ethics and governance", "伦理批件号，或机构对服务质量改进的正式认定及编号", "机构伦理或合规负责人"],
        ["Pilot dates and sample", "研究起止日期、连续纳入目标样本量", "研究协调员"],
        ["Conflict of interest", "如与平台公司存在雇佣、股权或资助关系，须如实申报", "全体作者"],
    ], [Cm(3.2), Cm(9.2), Cm(4.1)])
    add_text(doc, "不得填写或暗示：虚构样本量、临床获益、模型准确率、节省工时、真实 AI 使用量；也不得将隔离环境的软件验收结果当作患者研究结果。")

    doc.add_heading("4 最小可行研究方案", level=1)
    add_text(doc, "设计：前瞻性、单臂、混合方法实施研究。建议先以 e-poster 为目标；若实施规模扩大，再预设实施前后比较。")
    add_text(doc, "建议纳入：18 岁及以上、已完成相应用途的同意或授权、在研究期内有一份经专业人员审核且含潜在后续行动的健康报告或检查结果。")
    add_text(doc, "建议排除：紧急或需即时医疗处置者（直接按临床路径处理）；报告未完成专业审核；资料或授权不足；仅行政性而无健康行动价值的文件。")
    add_text(doc, "工作流：")
    add_bullets(doc, [
        "将已审核报告作为唯一临床内容输入。",
        "AI 生成可编辑、与来源绑定的行动草稿。",
        "健康顾问批准、修改、拒绝或升级处理。",
        "仅经批准的条目成为正式随访，并分配责任人与期限。",
        "服务或随访过程与关闭证据回写。",
        "每周审查异常、退回和安全事件。",
    ], numbered=True)

    doc.add_heading("5 预先定义的过程与安全指标", level=1)
    add_text(doc, "下列为方案阈值，提交前由团队确认。它们不是已获得的研究结果。")
    add_table(doc, ["指标", "建议目标", "定义或说明"], [
        ["可审核决策覆盖率", ">= 90%", "合资格报告有批准，或有理由的拒绝决定"],
        ["正式行动具名责任人比例", ">= 95%", "避免无人负责的计划"],
        ["未经人工批准自动发布", "0", "关键安全底线"],
        ["重复正式行动比例", "< 5%", "事先定义重复判定规则"],
        ["严重安全事件", "0", "逐例复核；小样本零事件不能推断安全性"],
    ], [Cm(5.0), Cm(3.0), Cm(8.5)])
    add_text(doc, "主要过程结局：有批准或有理由拒绝决定的报告比例、报告审核至决定的时间、正式行动有具名责任人的比例。")
    add_text(doc, "次要结局：草稿直接采纳、修改后采纳和拒绝比例；重复或超期行动；行动闭环率；人员耗时；患者任务负担。")
    add_text(doc, "安全监测：无来源建议、不恰当紧急程度、隐私或权限事件、人工批准前的行动尝试。")

    doc.add_heading("6 去标识化数据字典", level=1)
    add_text(doc, "每份合资格报告一行。不导出姓名、电话号码、证件号码、完整自由文本报告或其他可直接识别信息。使用随机研究编号；可逆对照表仅保存在获授权的受控环境。")
    add_table(doc, ["变量", "取值或格式", "用途"], [
        ["study_report_id", "随机字符串", "研究主键"],
        ["report_type", "体检、检验、影像、门诊、其他", "分层"],
        ["reviewed_at / decision_at", "日期时间", "计算决策时间"],
        ["eligible", "是、否加原因", "审计分母"],
        ["reviewer_decision", "approved, edited-approved, rejected, escalated", "主要过程结局"],
        ["source_grounded", "是、否、不确定", "人工来源核查"],
        ["action_owner_assigned", "是、否", "责任归属"],
        ["duplicate_flag", "是、否加原因", "重复率"],
        ["closure_status / closure_at", "closed, active, overdue, cancelled；日期时间", "闭环率与时长"],
        ["safety_event", "无、轻微、严重加分类", "安全监测"],
        ["staff_minutes", "数值", "人员负担"],
        ["patient_task_burden", "0 至 10 或简短量表", "患者体验"],
    ], [Cm(4.7), Cm(7.0), Cm(4.8)])

    doc.add_heading("7 分析口径", level=1)
    add_bullets(doc, [
        "流程覆盖率 = 有批准或有理由拒绝决定的合资格报告 / 合资格报告总数。",
        "决策时间 = decision_at - reviewed_at；报告中位数和四分位距。",
        "直接采纳率 = 未改直接批准 / 有 AI 草稿且已决定的报告数。",
        "修改后采纳率 = 修改后批准 / 有 AI 草稿且已决定的报告数。",
        "闭环率 = 预设观察窗内已关闭的正式行动 / 应有闭环的正式行动。",
        "超期率 = 观察截点仍超期的行动 / 到期行动数。",
    ])
    add_text(doc, "在正式分析前写定观察窗（建议 30 或 60 天）、重复定义、缺失数据处理，以及升级处理在分母中的规则。小样本只呈现描述统计和可信区间，不比较临床结局。")

    doc.add_heading("8 提交与执行清单", level=1)
    add_checklist(doc, [
        "明确研究负责人、家庭医生或临床审核共同作者、数据分析负责人和唯一报告者。",
        "请所在机构确认伦理审查、服务质量改进认定、同意或授权和数据跨境安排要求。",
        "冻结研究方案、纳排标准、结局定义和数据字典，避免看到结果后改变口径。",
        "配置去标识化导出和最小权限访问；研究数据不得包含完整报告原文。",
        "先以 5 至 10 例试运行检查流程和表单；是否计入正式分析须按方案预先规定。",
        "建立每周安全审查：无来源建议、错误紧急程度、权限或隐私事件、提前发布和重复任务。",
        "在 2026 年 11 月 1 日前固定摘要、作者排序和利益冲突表述。",
        "在 2026 年 11 月 10 日前完成系统提交并保存截图，不压线至 11 月 15 日。",
    ])

    doc.add_heading("9 备选题目", level=1)
    add_text(doc, "如果真实使用量不足以支撑实施研究，可改投方法与治理导向的 T 类研究：Designing Auditable Governance for Generative AI in Primary-Care Health Management。该题聚焦来源限制、角色权限、强制人工审核、版本控制、审计线索和失败恢复，且必须清楚表述为设计与实施研究。")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.core_properties.title = "WONCA APRC 2027 摘要投稿材料包"
    doc.core_properties.subject = "AI 辅助健康管理闭环的基层医疗实施研究"
    doc.core_properties.author = "JiayiCare"
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
