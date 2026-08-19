const mongoose = require('mongoose');

function validateReportScreeningAssociation({ screeningL1, screeningL2, l1Node, l2Node } = {}) {
  if (!mongoose.isValidObjectId(screeningL1) || !l1Node) {
    return { status: 400, message: '所选筛查大类已失效，请重新选择' };
  }
  if (!String(screeningL2 || '').trim() || !l2Node) {
    return { status: 400, message: '所选具体分类已失效或不属于当前大类，请重新选择' };
  }
  if (String(l2Node.parent || '') !== String(l1Node._id || screeningL1)) {
    return { status: 400, message: '所选具体分类不属于当前筛查大类，请重新选择' };
  }
  return null;
}

module.exports = { validateReportScreeningAssociation };
