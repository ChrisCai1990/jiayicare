const test = require('node:test');
const assert = require('node:assert/strict');

const { classificationName } = require('../src/utils/screeningMatch');

test('带检测方法尾缀的常见肿瘤标志物按关键词归入泛肿瘤标志物', () => {
  const names = [
    '糖类抗原19-9(CA19-9)+(电化学发光法)',
    '糖类抗原72-4测定[CA72-4]',
    '糖类抗原242(CA242)+(化学发光法)',
    '细胞角蛋白19片段(CYFRA21-1)',
    '神经元特异性烯醇化酶(NSE)+(电化学发光法)',
    '鳞状细胞癌相关抗原测定(SCC)',
    '胃泌素释放肽前体[ProGRP',
    '恶性肿瘤特异性生长因子(TSGF)+(速率法) (exzltsyzcdltsgf]',
  ];

  for (const name of names) {
    assert.equal(classificationName({ itemType: 'lab', name }), '泛肿瘤标志物', name);
  }
});

test('明确的英文肿瘤标志物缩写可带空格或连接符', () => {
  for (const name of ['CA 19-9', 'CA-242', 'CYFRA 21-1', 'NSE', 'SCCA', 'ProGRP', 'TSGF', 'AFP', 'CEA']) {
    assert.equal(classificationName({ itemType: 'lab', name }), '泛肿瘤标志物', name);
  }
});

test('不因普通抗原字样误归入泛肿瘤标志物', () => {
  assert.notEqual(classificationName({ itemType: 'lab', name: '乙型肝炎病毒表面抗原' }), '泛肿瘤标志物');
  assert.equal(classificationName({ itemType: 'lab', name: '肺炎支原体抗原' }), '肺炎支原体抗原');
});

test('带 ELISA 方法说明和 PG 缩写的胃蛋白酶原归入胃功能3项', () => {
  const names = [
    '胃蛋白酶原+ (ELISA) (PGI)',
    '胃蛋白酶原+ (ELISA) (PGII)',
    '胃蛋白酶原+ (ELISA) (PGI/PGII)',
    'PGI',
    'PGII',
    'PGI/PGII',
  ];

  for (const name of names) {
    assert.equal(classificationName({ itemType: 'lab', name }), '胃功能3项', name);
  }
});

test('带重复缩写或仪器后缀的血清肾功能项目归入肾功能', () => {
  const names = [
    '尿素(UREA) (UREA)',
    '血清肌酐(CREA) (CREA-J)',
    '血清尿酸(UA) (UA)',
    'UREA',
    'CREA-J',
    'UA',
  ];

  for (const name of names) {
    assert.equal(classificationName({ itemType: 'lab', name }), '肾功能', name);
  }
});

test('尿肌酐专项和尿素呼气试验优先于血清肾功能关键词', () => {
  assert.notEqual(classificationName({ itemType: 'lab', name: '尿肌酐测定' }), '肾功能');
  assert.notEqual(classificationName({ itemType: 'lab', name: '13C尿素呼气试验' }), '肾功能');
});
