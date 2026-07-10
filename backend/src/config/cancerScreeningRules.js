// 男女前十大常见肿瘤 + 筛查覆盖度规则库（金娟口径，2026-07-10 确认）
//
// 用途：AI 健康分析的「肿瘤筛查覆盖度」维度。针对每个高发肿瘤，不只解读做过的检查，
// 还判断"该做的筛查做了没"，没做的主动提示补做。规则由医学口径固化，AI 只负责匹配患者报告 + 措辞。
//
// 覆盖度模型（每个肿瘤的筛查项分三种角色）：
//   gold      金标准检查：做了它就算该肿瘤筛查覆盖达标
//   alternate 替代/初筛项：仅当金标准「没做」时才需要（做了金标准则免做）
//   adjunct   辅助项：不单独达标，仅辅助判断（如多数肿瘤标志物）
//   独立项由 special 规则单独描述（如 HP：不被胃镜替代，连续3年阴性才可停）
//
// 匹配靠 matchNames（在报告 reportItems.name / 报告 title 里做子串匹配）。

const CANCER_RULES = {
  // ── 男女通用高发 ──
  lung: {
    label: '肺癌', gender: 'all',
    // 金娟口径（2026-07-10）：低剂量CT与普通胸部CT在肺癌筛查覆盖上等同，做了任一胸部CT即达标
    gold:      [{ key: 'chest_ct', label: '胸部CT(低剂量或普通)', matchNames: ['低剂量', 'LDCT', '螺旋CT', '胸部CT', '肺部CT', '胸部平扫', '肺CT'] }],
    alternate: [],
    adjunct:   [{ key: 'cyfra', label: 'CYFRA21-1/NSE/CEA', matchNames: ['CYFRA', 'NSE', '癌胚抗原', 'CEA'] }],
    note: '胸部CT（低剂量或普通）均可作为肺癌筛查；胸片不能替代CT。',
  },
  colorectal: {
    label: '结直肠癌', gender: 'all',
    gold:      [{ key: 'colonoscopy', label: '肠镜', matchNames: ['肠镜', '结肠镜', '电子肠镜'] }],
    // 金娟口径：做了肠镜，便潜血/CEA 可免做
    alternate: [{ key: 'fobt', label: '便潜血FOBT', matchNames: ['便潜血', '粪便隐血', '潜血', 'FOBT', 'OB'] },
                { key: 'cea', label: 'CEA', matchNames: ['癌胚抗原', 'CEA'] }],
    adjunct:   [],
    note: '做过肠镜则便潜血、CEA可不作为常规复查项；肠镜发现息肉/腺瘤者按内镜医生建议缩短复查间隔。',
  },
  liver: {
    label: '肝癌', gender: 'all',
    gold:      [{ key: 'liver_us', label: '肝脏超声', matchNames: ['肝脏超声', '肝胆超声', '腹部超声', '肝胆彩超', '肝脏彩超'] },
                { key: 'afp', label: '甲胎蛋白AFP', matchNames: ['甲胎蛋白', 'AFP'] }],
    alternate: [],
    adjunct:   [],
    note: '乙肝/丙肝携带者、肝硬化者属高危，应每6个月做肝脏超声+AFP。',
    requireAll: true, // gold 里两项都要做才算达标
  },
  stomach: {
    label: '胃癌', gender: 'all',
    gold:      [{ key: 'gastroscopy', label: '胃镜', matchNames: ['胃镜', '电子胃镜', '胃十二指肠镜'] }],
    // 金娟口径：做胃镜→胃蛋白酶原/胃泌素G17免做；没胃镜时才需这些替代项
    alternate: [{ key: 'pg', label: '胃蛋白酶原PGⅠ/Ⅱ', matchNames: ['胃蛋白酶原', 'PGI', 'PGⅠ', 'PGR'] },
                { key: 'g17', label: '胃泌素G17', matchNames: ['胃泌素', 'G-17', 'G17'] }],
    adjunct:   [{ key: 'ca724', label: 'CA72-4', matchNames: ['CA72-4', 'CA724', '糖链抗原72'] }],
    note: '做过胃镜则胃蛋白酶原、胃泌素G17可不做；未做胃镜时以这些血清学项目做初筛。',
    special: [
      // 金娟口径：HP 独立项，不被胃镜替代；默认每年做，连续3年阴性才可停
      {
        key: 'hp', label: '幽门螺杆菌HP', matchNames: ['幽门螺杆菌', '幽门螺旋杆菌', 'HP', '碳13', '碳14', '13C', '14C', '尿素呼气'],
        rule: 'independent_yearly_stop_after_3neg',
        desc: '幽门螺杆菌是独立项，做过胃镜也仍需检测；默认每年检测，连续3年均为阴性方可停做。若近3年无连续阴性记录，应提示检测/复查。',
      },
    ],
  },
  esophagus: {
    label: '食管癌', gender: 'all',
    gold:      [{ key: 'gastroscopy_eso', label: '胃镜(含食管段)', matchNames: ['胃镜', '食管镜', '胃十二指肠镜'] }],
    alternate: [], adjunct: [],
    note: '胃镜检查含食管段，做过胃镜即覆盖食管癌筛查。',
  },
  pancreas: {
    label: '胰腺癌', gender: 'all',
    gold:      [{ key: 'abd_img', label: '腹部超声/CT', matchNames: ['腹部超声', '腹部CT', '上腹', '胰腺'] },
                { key: 'ca199', label: 'CA19-9', matchNames: ['CA19-9', 'CA199', '糖链抗原19'] }],
    alternate: [], adjunct: [],
    note: 'CA19-9持续升高+腹部影像异常需警惕，单项轻度升高特异性低。',
  },

  // ── 男性特有 ──
  prostate: {
    label: '前列腺癌', gender: 'M',
    gold:      [{ key: 'psa', label: 'PSA(前列腺特异抗原)', matchNames: ['PSA', '前列腺特异', '前列腺抗原'] },
                { key: 'prostate_us', label: '前列腺超声', matchNames: ['前列腺超声', '前列腺彩超'] }],
    alternate: [], adjunct: [],
    note: 'PSA是所有肿瘤标志物中对前列腺癌相对特异的项，50岁以上男性建议每年检测。',
  },

  // ── 女性特有 ──
  breast: {
    label: '乳腺癌', gender: 'F',
    // 金娟口径：40岁以上必须 超声+钼靶；40岁以下 超声达标即可（在 evalCancer 里按年龄动态处理）
    gold:      [{ key: 'breast_us', label: '乳腺超声', matchNames: ['乳腺超声', '乳腺彩超', '乳房超声'] },
                { key: 'mammography', label: '乳腺钼靶', matchNames: ['钼靶', '乳腺X', '乳腺钼钯', 'MG'] }],
    alternate: [], adjunct: [{ key: 'ca153', label: 'CA15-3', matchNames: ['CA15-3', 'CA153', '糖链抗原15'] }],
    note: '40岁以上女性需乳腺超声+钼靶；40岁以下乳腺超声达标即可。',
    ageRule: 'breast_mammo_over40',
  },
  cervical: {
    label: '宫颈癌', gender: 'F',
    gold:      [{ key: 'hpv', label: 'HPV', matchNames: ['HPV', '人乳头瘤'] },
                { key: 'tct', label: 'TCT(宫颈细胞学)', matchNames: ['TCT', '宫颈细胞', '液基细胞', '细胞学'] }],
    alternate: [], adjunct: [],
    note: 'HPV+TCT联合筛查为宫颈癌金标准，两者都做才算覆盖完整。',
    requireAll: true,
  },
  thyroid: {
    label: '甲状腺癌', gender: 'all',
    gold:      [{ key: 'thyroid_us', label: '甲状腺超声', matchNames: ['甲状腺超声', '甲状腺彩超'] }],
    alternate: [], adjunct: [],
    note: '甲状腺超声看TI-RADS分级；结节需按分级定期随访。',
  },
  ovarian: {
    label: '卵巢癌', gender: 'F',
    gold:      [{ key: 'gyn_us', label: '妇科超声', matchNames: ['妇科超声', '经阴道超声', '子宫附件超声', '盆腔超声'] },
                { key: 'ca125', label: 'CA125', matchNames: ['CA125', 'CA-125', '糖链抗原125'] }],
    alternate: [], adjunct: [{ key: 'he4', label: 'HE4', matchNames: ['HE4', '附睾蛋白'] }],
    note: 'CA125特异性有限，需结合妇科超声与HE4判断。',
    requireAll: true,
  },
  endometrial: {
    label: '子宫内膜癌', gender: 'F',
    gold:      [{ key: 'tv_us', label: '经阴道妇科超声', matchNames: ['经阴道超声', '妇科超声', '子宫附件超声', '盆腔超声'] }],
    alternate: [], adjunct: [{ key: 'ca125_endo', label: 'CA125', matchNames: ['CA125', 'CA-125', '糖链抗原125'] }],
    note: '绝经后异常出血需重点排查，经阴道超声看内膜厚度。',
  },
};

module.exports = { CANCER_RULES };
