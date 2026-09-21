// One human confirmation, existing review/publish first, original closure last.
// A failed/partial publication never closes the original management plan.
const contentKey = rows => JSON.stringify((rows || []).map(row => ({ title: String(row.title || '').trim(), content: String(row.content || '').trim(), date: row.date || '', category: row.category || '', requiresService: row.requiresService === true })));
export async function submitMergedOutcome({ api, item, reportIds, decision, note, checked, draft }) {
  if (!checked || !note.trim() || !reportIds.length) throw new Error('请核对完整资料并填写处置结论');
  if (!['new_plan', 'no_further'].includes(decision)) throw new Error('请选择后续安排');
  if (decision === 'new_plan' && !draft) throw new Error('请选择后续随访草稿');
  let reviewed = draft;
  if (draft) {
    if (!reportIds.includes(String(draft.reportId?._id || draft.reportId))) throw new Error('随访草稿必须属于本次所选报告');
    if (decision === 'new_plan' && !draft.followUpDrafts?.length) throw new Error('需要继续时必须有后续计划');
    if (decision === 'no_further' && draft.followUpDrafts?.length) throw new Error('无需继续时请先核对并移除不适用的后续计划');
    if (draft.status !== 'approved' || draft.followUpPublication?.status !== 'published') {
      reviewed = (await api.reviewReportFollowUpDraft(draft._id, { action: 'approve', revision: draft.__v, followUpDrafts: draft.followUpDrafts || [] })).data;
    }
    if (reviewed?.status !== 'approved' || reviewed.followUpPublication?.status !== 'published') throw new Error('随访发布尚未完成，原计划保持开放；请重试，不必重新建立计划');
    if (contentKey(reviewed.followUpDrafts) !== contentKey(draft.followUpDrafts)) throw new Error('服务端已审核内容与当前编辑不同，请刷新核对；原计划未关闭');
    if ((reviewed.followUpDrafts?.length > 0) !== (decision === 'new_plan')) throw new Error('已审核后续安排与本次选择不一致，请刷新核对；原计划未关闭');
  }
  return api.reviewFollowUpOutcome(item._id, { updatedAt: item.updatedAt, reportIds, decision, note, checksComplete: checked, reportDraftId: reviewed?._id });
}
