// 官网专业审核为固定负责人职责，不能按同岗位广播；使用已核对的账号 ID，改名不改变权限。
const CONTENT_REVIEW_OWNERS = Object.freeze({
  familyDoctor: '6a28b5b4441e73bd7deb3ba5', // 蓝戈文
  nutritionist: '6a28b635441e73bd7deb3c1e', // 吴苗苗
});

function canAccessContentReview(staff) {
  if (!staff || staff.staffStatus === 'inactive') return false;
  if (staff.role === 'superadmin') return true;
  const owner = CONTENT_REVIEW_OWNERS[staff.role];
  return !!owner && String(staff._id || '') === owner;
}

module.exports = { CONTENT_REVIEW_OWNERS, canAccessContentReview };
