const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextAikangExam } = require('../src/utils/reportTextAikangExam');
const { filterUnsupportedCtProtocol } = require('../src/utils/reportCtProtocol');

test('transcribes the printed CT findings and numbered opinion without image inference', () => {
  const text = `健康体检报告 MEDICAL EXAMINATION REPORT
CT室                                                    检查者： 审核者：
检查项⽬                    检查所⻅                                                  单位
                         胸廓两侧对称，⽀⽓管⾎管束清晰。两肺内⻅多个结节影，较⼤位
                         于右肺下叶(IMG158)为实性结节，⼤⼩约3.1mm*4.1mm，边界清
                         。左肺上叶⻅⼩囊状透亮影。
 胸部（CT）                  畅。⼼脏及⼤⾎管未⻅异常。
           1.肺内结节（建议年度复查）
 初步意⻅      2.肺⽓囊
           3.纵隔结节（建议增强扫描）
爱康国宾杭州西溪天堂旗舰中心`;
  const result = parseTextAikangExam(text, 20);
  assert.equal(result.supported, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, '胸部（CT）');
  assert.match(result.items[0].findings, /3.1mm\*4.1mm/);
  assert.match(result.items[0].diagnosis, /纵隔结节/);
  assert.equal(result.items[0].manualReviewStatus, 'pending');
});

test('preserves all five oral finding and advice rows as one reviewable exam', () => {
  const text = `健康体检报告 MEDICAL EXAMINATION REPORT
4.⼝腔检查结果
序号       症状描述                                     建议
 1    ⽛结⽯不同程度            ⽛结⽯为局部刺激因素，可引发⽛龈炎、⽛周炎，建议龈上洁治，去除局部
      附着于⽛颈部             危险因素。
 2    ⽛龈退缩               建议前往⼝腔科诊治。
 3    (43)Ⅱ度松动           建议拍⽛⽚，⽛周基础治疗或拔除
 4    (28)智⻮，⽆对          建议拔除
      合，伸⻓
 5    (42)⽛缺失            建议拍全景⽚或CBCT
巴⽒刷⽛法`;
  const result = parseTextAikangExam(text, 22);
  assert.equal(result.supported, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, '口腔检查结果');
  assert.match(result.items[0].findings, /1\s+牙结石不同程度/);
  assert.match(result.items[0].findings, /5\s+\(42\)牙缺失/);
  assert.equal(result.items[0].manualReviewStatus, 'pending');
});

test('does not infer an exam from incomplete or unrelated layouts', () => {
  assert.equal(parseTextAikangExam('健康体检报告 MEDICAL EXAMINATION REPORT\nCT室', 20).supported, false);
  assert.equal(parseTextAikangExam('序号 症状描述 建议\n1 牙结石', 22).supported, false);
});

test('ordinary chest CT is not classified as low-dose screening CT', () => {
  const lowDose = { node: { id: '肺癌早筛|胸部（低剂量螺旋）CT' } };
  assert.deepEqual(filterUnsupportedCtProtocol({ itemType: 'imaging', name: '胸部（CT）' }, [lowDose]), []);
  assert.deepEqual(filterUnsupportedCtProtocol({ itemType: 'imaging', name: '胸部低剂量CT' }, [lowDose]), [lowDose]);
});
