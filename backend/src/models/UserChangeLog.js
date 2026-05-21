const mongoose = require('mongoose');

// 记录用户修改联系电话 / 配送地址的变更日志（需求 #34）
const userChangeLogSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:  { type: String, default: '' },
  userPhone: { type: String, default: '' },
  field:     { type: String, required: true },  // 'contactPhone' | 'deliveryAddress'
  fieldLabel:{ type: String, default: '' },      // 中文名，便于展示
  oldValue:  { type: String, default: '' },
  newValue:  { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('UserChangeLog', userChangeLogSchema);
