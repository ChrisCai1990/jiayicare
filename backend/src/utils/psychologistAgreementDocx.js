const zlib = require('node:zlib');

const escapeXml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const paragraph = (value, style = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}<w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const chunks = [], directory = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const filename = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const data = zlib.deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    chunks.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const directoryBuffer = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directoryBuffer, end]);
}

function createPsychologistAgreementDocx({ name, singleFee }) {
  if (!String(name || '').trim() || !Number.isFinite(singleFee) || singleFee < 0) throw new Error('咨询师姓名或已审核单次报酬无效');
  const body = [
    paragraph('心理咨询师合作协议', 'Title'),
    paragraph('甲方：杭州嘉医汇健康管理有限公司'),
    paragraph('统一社会信用代码：91330109MA2CDMRE9E    法定代表人：金娟'),
    paragraph(`乙方：${name}    身份证号：________________________`),
    paragraph('双方就甲方客户的非医疗心理咨询服务达成如下协议。乙方应在签署前核对个人信息、单次报酬及全部条款。'),
    paragraph('一  合作期限与性质', 'Heading1'),
    paragraph('本协议自双方签署之日起生效，有效期至____年____月____日。乙方作为独立服务方提供约定服务；实际用工关系依法律及实际履行判断。任何一方可提前30日书面通知终止合作。'),
    paragraph('二  服务范围', 'Heading1'),
    paragraph('乙方提供心理健康咨询、情绪与压力支持等非医疗服务。标准服务按次提供，每次通常为50分钟。乙方不得以心理咨询名义实施心理治疗、精神障碍诊断或治疗，不得开具处方或承诺疗效。发现可能患有精神障碍的客户，应建议其前往符合规定的医疗机构就诊。出现自伤、伤人等紧急风险时，乙方应按甲方危机处置流程及时报告并采取必要措施。'),
    paragraph('三  服务安排与准入', 'Heading1'),
    paragraph('甲方负责客户预约、服务安排和平台入口。乙方应提供真实身份、培训、从业经历及适用的资格资料，仅承接胜任范围内的个案。乙方不得擅自转交客户或私下收费。'),
    paragraph('四  客户告知与记录', 'Heading1'),
    paragraph('甲方负责向客户告知服务性质、收费与退改规则并取得必要授权。乙方在首次咨询时说明咨询方式、保密范围和风险处置。未经客户明确同意，不得录音录像。乙方应在甲方授权的受限档案中真实、及时记录必要的服务内容和风险；更正记录须留痕。'),
    paragraph('五  保密与个人信息', 'Heading1'),
    paragraph('乙方仅为履行本协议使用客户信息，不得将咨询记录复制至私人设备、个人网盘、通用聊天群或未经批准的人工智能工具，不得用于营销、模型训练、宣传或其他客户。合作终止后应完成资料交接并停止访问；法定披露和必要的安全处置除外。'),
    paragraph('六  服务费与结算', 'Heading1'),
    paragraph(`乙方单次固定服务费为人民币 ${singleFee.toFixed(2)} 元。双方按上月21日00:00至本月20日24:00（北京时间）实际完成并核验的咨询次数结算，甲方于本月25日付款；本月25日如遇节假日，顺延至其后首个工作日。客户未到、迟到导致约定服务未完成，或中途结束且未完成约定服务的，该次不计费；迟到后仍完成约定时长的，按已完成服务计费。已完成且经核验的费用不因客户其后付款或退款扣减。单价变更须双方签署新版附件，不追溯已完成服务。`),
    paragraph('七  质量与责任', 'Heading1'),
    paragraph('双方对自身过错和违约行为依法承担责任。客户投诉或安全事件发生后，双方应及时协作处理并保存记录，不得擅自删除或改写证据。乙方应遵守适用的专业规范和甲方合理的客户安全要求。'),
    paragraph('八  终止与争议', 'Heading1'),
    paragraph('一方严重违反保密义务、超范围服务、资质不实或发生重大客户安全风险时，守约方可暂停服务和相关资料访问，并依约解除。终止时双方应完成在服务客户的转介、已完成服务的费用对账及资料交接。争议先协商；协商不成，向有管辖权的人民法院提起诉讼。'),
    paragraph('九  其他', 'Heading1'),
    paragraph('本协议一式两份，双方各执一份。双方对本协议的修改须书面确认。双方应在签署前填写空白信息并核对完整正文。'),
    paragraph('甲方（盖章）：____________________    乙方（手写签名）：____________________'),
    paragraph('甲方签署日期：____年____月____日    乙方签署日期：____年____月____日'),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1240" w:right="1200" w:bottom="1240" w:left="1200"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:lang w:eastAsia="zh-CN"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="300"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style></w:styles>`;
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['word/document.xml', document], ['word/styles.xml', styles],
  ]);
}
module.exports = { createPsychologistAgreementDocx };
