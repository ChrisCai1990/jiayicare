const mongoose = require('mongoose');

// 开单项目（每个检查/检验项目对应一行）
const requisitionItemSchema = new mongoose.Schema({
  itemType: {
    type: String,
    enum: ['labTestOrder', 'specialExam', 'labTestItem', 'labTestPackage'],
    required: true,
  },
  itemId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  itemName: { type: String, required: true },           // 冗余名称，防止关联记录被删除
  notes:    { type: String, default: '' },              // 注意事项
  status: {
    type: String,
    enum: ['pending', 'uploaded', 'reviewed'],
    default: 'pending',
  },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', default: null },
  uploadedAt: { type: Date, default: null },
}, { _id: true });

const examRequisitionSchema = new mongoose.Schema({
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  staffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  title:      { type: String, default: '' },      // 如"2026年5月体检开单"
  notes:      { type: String, default: '' },      // 整体备注
  items:      [requisitionItemSchema],
  status: {
    type: String,
    enum: ['open', 'partial', 'completed', 'cancelled'],
    default: 'open',
  },
  dueDate:    { type: Date, default: null },
}, { timestamps: true });

examRequisitionSchema.index({ patientId: 1, createdAt: -1 });
examRequisitionSchema.index({ staffId: 1, createdAt: -1 });

module.exports = mongoose.model('ExamRequisition', examRequisitionSchema);
