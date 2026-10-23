const REPORT_KEY_MAP = {
                fpg:   ['空腹血糖','空腹葡萄糖','GLU','FPG','Glu(空腹)','血糖-0'],
                hba1c: ['糖化血红蛋白','HbA1c','HbA1C','HBA1C','HBA1c','HbA1c(%)'],
                // 裸'胆固醇'会误命中'高密度脂蛋白胆固醇'(HDL)/'低密度脂蛋白胆固醇'(LDL)——金娟2026 TC误取成HDL的1.73(应4.42)。排除脂蛋白类
                tc:    { names: ['总胆固醇','TC','CHOL','胆固醇'], exclude: ['高密度','低密度','脂蛋白','HDL','LDL'] },
                tg:    ['甘油三酯','TG','三酰甘油','TRIG'],
                ldl:   ['低密度脂蛋白','LDL','LDL-C','LDL-胆固醇'],
                hdl:   ['高密度脂蛋白','HDL','HDL-C','HDL-胆固醇'],
                alt:   ['谷丙转氨酶','ALT','丙氨酸转氨酶','丙氨酸氨基转移酶'],
                // 天/门冬 × 转氨酶/氨基转移酶 四种写法全覆盖（2026-07-10：金娟名下"天冬氨酸氨基转移酶"此前漏配，导致历年AST只显示最新一年）
                ast:   ['谷草转氨酶','AST','天冬氨酸转氨酶','天冬氨酸氨基转移酶','门冬氨酸转氨酶','门冬氨酸氨基转移酶'],
                // 故意不含'谷氨酰转肽酶'，避免匹配到 尿谷氨酰转肽酶G（尿液GGT）
                ggt:   ['γ-谷氨酰转肽酶','γ-谷氨酸转肽酶','GGT','γ-GT','γGT','谷氨酸转肽酶'],
                // 排除'结晶/盐结晶'：三大常规里的"尿酸结晶"不是血尿酸
                ua:    { names: ['尿酸','UA','SUA'], exclude: ['结晶','盐结晶'] },
                // 血肌酐：不含短形式'Cr'，避免匹配到尿Cr（尿液肌酐）。
                // 2026-07-09修复"血肌酐夹杂尿肌酐"：names含裸"肌酐"会匹配到"尿肌酐/尿液肌酐/U-肌酐"，
                // 用exclude排除所有尿液标本的肌酐（带"尿"字），确保只取血清肌酐。
                cr:    { names: ['血肌酐','血清肌酐','肌酐','CREA','SCr','S-Cr','血Cr'], exclude: ['尿','U-','U肌酐','U-Cr'] },
                umalb: ['尿微量白蛋白','尿微量蛋白','mAlb','MAU','微量白蛋白','MALB'],
                egfr:  ['肾小球滤过率','eGFR','GFR','估算肾小球滤过率'],
                hcy:   ['同型半胱氨酸','Hcy','HCY'],
                lpla2: ['Lp-PLA2','脂蛋白磷脂酶A2','LPLA2'],
                // 动态血压监测报告里有"夜间收缩压下降率""24小时收缩压最大值"等衍生指标，
                // name本身包含"收缩压"三个字但value是百分比/衍生值不是真实血压，必须排除，
                // 否则会被误判命中显示成血压数值（2026-07-03 潘孝银"动态血压"报告复现过）
                sbp:   { names: ['收缩压','SBP','收缩压(mmHg)'], exclude: ['下降率','最大值','最小值','负荷','标准差','变异'] },
                dbp:   { names: ['舒张压','DBP','舒张压(mmHg)'], exclude: ['下降率','最大值','最小值','负荷','标准差','变异'] },
                weight:{ names: ['体重','Weight','BW'], exclude: ['体重指数','BMI','身体质量指数'] },
              }
const METRIC_NAMES = { fpg: '空腹血糖', hba1c: '糖化血红蛋白', tc: '总胆固醇', tg: '甘油三酯', ldl: '低密度脂蛋白', hdl: '高密度脂蛋白', alt: '谷丙转氨酶', ast: '谷草转氨酶', ggt: 'γ-谷氨酰转肽酶', ua: '尿酸', cr: '血肌酐', umalb: '尿微量蛋白', egfr: '肾小球滤过率', hcy: '同型半胱氨酸', lpla2: '脂蛋白磷脂酶A2', sbp: '收缩压', dbp: '舒张压', weight: '体重' };
function matchingKey(name) {
  const text = String(name || '');
  return Object.keys(REPORT_KEY_MAP).find(key => {
    const def = REPORT_KEY_MAP[key];
    const names = Array.isArray(def) ? def : def.names;
    const exclude = Array.isArray(def) ? [] : def.exclude || [];
    return names.some(n => text.toLowerCase().includes(n.toLowerCase())) && !exclude.some(ex => text.includes(ex));
  });
}
module.exports = { REPORT_KEY_MAP, METRIC_NAMES, matchingKey };
