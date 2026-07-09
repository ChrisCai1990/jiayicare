const mongoose = require('mongoose');

// 企业客户：B2B2C模式下，企业为员工批量采购健康管理服务
const enterpriseSchema = new mongoose.Schema({
  name:         { type: String, required: true }, // 企业名称
  creditCode:   { type: String, default: '' },     // 统一社会信用代码
  contactName:  { type: String, default: '' },     // 对接人姓名（企业侧HR/行政）
  contactPhone: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  logo:         { type: String, default: '' },
  // 合同信息
  contractStartAt: { type: Date, default: null },
  contractEndAt:   { type: Date, default: null },
  seatsTotal:      { type: Number, default: 0 },    // 采购名额总数
  packageType:     { type: String, default: '' },   // 采购的服务包类型，如 pkg_1y
  status:          { type: String, enum: ['active', 'expired', 'suspended'], default: 'active' },
  note:            { type: String, default: '' },

  // ── HR看板财务数据（超管后台手工录入，按年度记录）──────────────────
  // 一个企业跨年度可能有多份数据，用 byYear 存：{ '2026': { ...一年的各项 } }
  // 当年数据供 HR 看板展示体检机构/人数/客单价/总额、保险、健康管理费、其他付费服务等。
  hrDataByYear: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    // 每年结构（均为手工录入）：
    // {
    //   examOrg:        String   体检机构
    //   examCount:      Number   当年体检人数
    //   examUnitPrice:  Number   客单价
    //   examTotal:      Number   体检总额
    //   examStartAt/examEndAt:   体检服务起止（三维度时间各不相同，各自记）
    //   insurerName:    String   保险公司
    //   insuredCount:   Number   参保人数（如给高管买高端医疗险）
    //   insuredAmount:  Number   保险金额
    //   insuredStartAt/insuredEndAt:  高端险起止
    //   healthMgmtFee:  Number   健康管理费
    //   healthMgmtStartAt/healthMgmtEndAt:  健康管理服务起止
    //   otherServices:  [{ name, frequency:String, detail:String }]  付费健康管理服务清单（frequency=频次如"每季度1次"，detail=具体内容）
    //   healthFund:     健康基金 { transactions:[{source:'企业自有'|'平台赠送', amount, date, note}], used, total, balance }
    //                   total=充值流水累加，balance=total-used（系统算）
    // }
  },
}, { timestamps: true });

module.exports = mongoose.model('Enterprise', enterpriseSchema);
