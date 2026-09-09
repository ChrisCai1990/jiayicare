const ASSIGN_FIELDS = [
  "assignedFamilyDoctor",
  "assignedNutritionist",
  "assignedSpecialist",
  "assignedTcmDoctor",
  "assignedPsychologist",
  "assignedRehabSpecialist",
  "assignedMedicalAssistant",
  "assignedHealthManager",
  "assignedHealthPlanner",
];
const same = (a, b) => String(a?._id || a || "") === String(b?._id || b || "");
function canAccessPatient(staff, patient) {
  return (
    !!patient &&
    !patient.isDeleted &&
    same(staff.tenantId, patient.tenantId) &&
    (staff.role === "superadmin" ||
      ASSIGN_FIELDS.some((key) => same(patient[key], staff._id)))
  );
}
function canAccessGroup(staff, group) {
  return (
    !!group &&
    same(staff.tenantId, group.tenantId) &&
    (staff.role === "superadmin" ||
      same(group.owner, staff._id) ||
      group.staffIds.some((id) => same(id, staff._id)))
  );
}
function parseCommand(text) {
  const match = String(text || "")
    .trim()
    .match(/^嘉医汇(归档|待办|记录|总结)[：:]\s*([\s\S]+)$/);
  if (!match) return null;
  const kind = {
    归档: "archive",
    待办: "task",
    记录: "record",
    总结: "summary",
  }[match[1]];
  return { kind, text: match[2].trim(), requiresConfirmation: true };
}
function fileMime(buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  if (
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}
function validTransition(from, to) {
  return (
    {
      draft: ["confirmed", "planned", "cancelled"],
      planned: ["in_progress", "completed", "cancelled"],
      in_progress: ["completed", "cancelled"],
    }[from] || []
  ).includes(to);
}
function checkedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw Object.assign(new Error("日期无效"), { status: 400 });
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    date.toISOString().slice(0, 10) !== value
  )
    throw Object.assign(new Error("日期不存在"), { status: 400 });
  return date;
}
function summaryDraft(raw, source) {
  const value = JSON.parse(
    String(raw)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
  );
  if (typeof value.summary !== "string" || !value.summary.trim())
    throw new Error("AI未返回有效总结");
  const suggestions = (Array.isArray(value.tasks) ? value.tasks : [])
    .slice(0, 10)
    .filter(
      (t) =>
        typeof t.title === "string" &&
        t.title.trim() &&
        typeof t.sourceQuote === "string" &&
        t.sourceQuote.trim() &&
        source.includes(t.sourceQuote)
    )
    .map((t) => ({
      title: t.title.slice(0, 160),
      content: String(t.content || "").slice(0, 2000),
      sourceQuote: t.sourceQuote.slice(0, 2000),
    }));
  return { content: value.summary.slice(0, 20000), suggestions };
}
module.exports = {
  summaryDraft,
  ASSIGN_FIELDS,
  same,
  canAccessPatient,
  canAccessGroup,
  parseCommand,
  fileMime,
  validTransition,
  checkedDate,
};
