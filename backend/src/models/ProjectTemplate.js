const mongoose = require('mongoose');

const projectTemplateSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  templateType: { type: String, default: '' }, // 体检方案/健康管理方案/营养干预方案等
  items: [{
    itemType: { type: String, enum: ['labTestItem', 'labTestOrder', 'labTestPackage', 'specialExam', 'serviceItem', 'otherCharge'] },
    itemId:   { type: mongoose.Schema.Types.ObjectId },
    itemName: { type: String, default: '' }, // 冗余存储，方便展示
  }],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('ProjectTemplate', projectTemplateSchema);
