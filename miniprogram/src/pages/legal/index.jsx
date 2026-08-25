import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { colors, spacing, radius } from '../../theme';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

// 内容与 app/src/screens/legal/LegalScreen.js 完全一致（项目自有法律文本）
const CONTENT = {
  terms: {
    title: '用户协议',
    sections: [
      { heading: '1. 接受条款', body: '欢迎使用嘉医汇（以下简称"本应用"），由杭州嘉静佑辰科技有限公司运营。您在使用本应用前，请仔细阅读本用户协议。一旦您使用本应用，即表示您已阅读并同意遵守本协议的全部条款。' },
      { heading: '2. 服务内容', body: '本应用提供健康档案整理、体检信息整理、健康数据趋势展示、生活方式管理、健康提醒及健康体检服务。所有服务内容可能因地区、套餐类型不同而有所差异。' },
      { heading: '3. 用户注册与账号安全', body: '您需使用真实手机号注册账号。请妥善保管账号及验证码，不得转让或出借给他人使用。如发现账号被盗用，请立即联系客服。' },
      { heading: '4. 使用规范', body: '您不得利用本应用从事任何违法活动，不得上传虚假健康信息，不得干扰系统正常运行，不得侵犯他人合法权益。' },
      { heading: '5. 知识产权', body: '本应用的所有内容，包括但不限于文字、图形、图标、界面设计、程序代码，均受知识产权法律保护，未经授权不得复制、修改或传播。' },
      { heading: '6. 服务变更与中止', body: '我们有权在必要时对服务内容进行调整，包括功能增减、价格变化等。如服务发生重大变更，我们将提前通知用户。' },
      { heading: '7. 协议修改', body: '本协议可能随时修订，修订后的协议将在应用内公布。继续使用本应用即视为接受修订后的协议。' },
      { heading: '8. 适用法律', body: '本协议受中华人民共和国法律管辖。因本协议产生的争议，双方应友好协商解决；协商不成的，提交有管辖权的人民法院解决。' },
    ],
  },
  privacy: {
    title: '隐私政策',
    sections: [
      { heading: '1. 信息收集', body: '我们收集您主动提供的信息（如手机号、年龄、性别、健康数据）以及设备信息（如操作系统版本、浏览器类型），用于提供和改善服务。' },
      { heading: '2. 信息使用', body: '您的信息仅用于提供健康档案整理、趋势展示、服务通知与您主动选择的健康管理服务。向健康顾问或其他服务人员展示必要信息前，我们将依据服务关系和授权控制访问范围，不会出售您的个人信息。' },
      { heading: '3. 健康数据保护', body: '体检报告、健康档案、用药记录及聊天中涉及健康状况的信息属于敏感个人信息。我们将在取得单独同意后，按照明确目的和最小必要范围处理，并通过加密存储和授权访问保护健康数据；拒绝非必要处理不影响您使用其他基础功能。' },
      { heading: '4. 数据存储与安全', body: '我们采用行业标准的安全措施（SSL 传输加密、JWT 身份验证、数据库加密）保护您的数据。数据存储于境内合规的云服务器，符合《网络安全法》及《个人信息保护法》要求。' },
      { heading: '5. 第三方服务', body: '本应用可能使用短信、云存储、对象存储及已依法提供服务的AI模型接口。我们会在实际启用的隐私保护指引中列明第三方名称、处理目的和信息类型，并限制其仅按约定处理必要信息。' },
      { heading: '6. 保存期限', body: '我们仅在实现服务目的所必需的期限内保存个人信息；法律法规另有保存要求的，从其规定。超过期限后将删除或匿名化处理。' },
      { heading: '7. 您的权利与账号注销', body: '您有权访问、更正、复制、删除个人信息，撤回同意并申请注销账号。可通过“我的—帮助与反馈”提交申请；我们核验身份后依法处理。紧急投诉可联系客服：19106761448。' },
      { heading: '8. 未成年人保护', body: '本应用不面向 18 周岁以下未成年人。如您是未成年人的监护人，请确保监护对象不单独使用本应用。' },
      { heading: '9. 隐私政策更新', body: '本隐私政策可能不定期更新。重大变更时，我们将通过应用内通知或短信方式告知您。' },
    ],
  },
  service: {
    title: '健康管理服务说明',
    sections: [
      { heading: '1. 服务性质', body: '嘉医汇是非医疗健康管理服务平台，提供健康档案整理、体检信息整理、健康数据趋势展示、生活方式管理、健康提醒及健康体检服务。平台不属于医疗机构，不开展互联网诊疗。' },
      { heading: '2. 服务边界', body: '平台及其AI健康规划师不提供疾病诊断、治疗方案、处方、线上复诊、检查开单、药品推荐、停换药或剂量调整。健康管理内容不能替代医疗机构和执业医师的诊疗意见。' },
      { heading: '3. AI健康规划师', body: '小嘉仅用于梳理会员的健康管理需求、明确阶段目标、介绍平台服务并规划服务步骤。健康资料仅用于匹配可能需要的非医疗健康管理支持，不用于作出疾病判断或治疗建议。' },
      { heading: '4. AI健康信息整理', body: 'AI仅对会员主动提供的健康档案、体检报告原文和日常记录进行分类、摘要及趋势展示。健康关注提示不作风险诊断或疾病判断；指标异常时仅提示会员携带原始资料咨询正规医疗机构。' },
      { heading: '5. 报告与数据', body: '系统仅对会员上传报告中的文字、指标和参考范围进行信息提取、分类及趋势展示，不作疾病诊断。原始报告及医疗机构出具的正式结论具有优先效力。' },
      { heading: '6. 用药与营养补充记录', body: '相关功能仅记录会员根据处方、医嘱、产品标签或本人陈述提供的信息。工作人员核对的是录入内容与所提供资料是否一致，不代表平台开药、推荐产品、决定停换药或调整剂量。' },
      { heading: '7. 就医提示', body: '出现身体不适、指标明显异常或持续加重时，请及时前往正规医疗机构；出现胸痛、呼吸困难、意识障碍等紧急情况，请立即拨打120。' },
      { heading: '8. 会员选择', body: '平台可基于会员主动表达的目标介绍健康管理服务，但会说明服务内容，是否购买由会员自主决定。平台不承诺疾病预防、治疗或保健效果。' },
    ],
  },
  disclaimer: {
    title: '免责声明',
    sections: [
      { heading: '1. 非医疗服务声明', body: '本应用仅提供非医疗健康管理服务，不提供疾病诊断、治疗、处方、线上复诊或检查开单。任何医疗问题请以正规医疗机构和执业医师的专业判断为准。' },
      { heading: '2. AI 健康规划师限制', body: 'AI健康规划师仅负责健康管理需求梳理、目标规划和平台服务介绍，不提供医疗相关咨询。如您有身体不适或紧急健康状况，请及时就医或立即拨打120。' },
      { heading: '3. 数据准确性', body: '本应用中的健康评分、趋势分析等数据由算法自动生成，仅供参考，不代表医学评估结论。健康指标的异常提示不能替代专业医学检查与诊断。' },
      { heading: '4. 服务可用性', body: '本应用可能因服务器维护、网络故障、不可抗力等原因出现短暂不可用情况。我们将尽力保证服务稳定性，但不对因此造成的任何损失承担责任。' },
      { heading: '5. 第三方链接', body: '本应用可能包含指向第三方网站或服务的链接。我们对第三方内容的准确性、合法性及安全性不承担任何责任。' },
      { heading: '6. 紧急情况声明', body: '本应用不提供紧急医疗救援服务。如遇生命危险或紧急医疗情况，请立即拨打急救电话 120，或前往最近的医疗机构就诊。' },
    ],
  },
};

export default function LegalPage() {
  const { statusBarHeight } = useNavBar();
  const router = useRouter();
  const type = router.params?.type || 'terms';
  const doc = CONTENT[type] || CONTENT.terms;

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>{doc.title}</Text>
        <View style={{ width: '28px' }} />
      </View>
      <View style={{ backgroundColor: '#fff', padding: `${spacing.md}px ${spacing.lg}px`, borderBottom: `1px solid ${colors.borderLight}` }}>
        <Text style={{ fontSize: '12px', color: colors.textMuted }}>更新日期：2026年1月1日</Text>
      </View>
      <View style={{ padding: `${spacing.lg}px` }}>
        {doc.sections.map((s, i) => (
          <View key={i} style={{ marginBottom: `${spacing.lg}px` }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>{s.heading}</Text>
            <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '22px' }}>{s.body}</Text>
          </View>
        ))}
        <View style={{
          padding: `${spacing.md}px`, backgroundColor: '#fff', borderRadius: `${radius.md}px`,
          border: `1px solid ${colors.borderLight}`, textAlign: 'center',
        }}>
          <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block' }}>嘉医汇 · 杭州嘉静佑辰科技有限公司</Text>
          <Text style={{ fontSize: '12px', color: colors.textMuted }}>客服电话：19106761448</Text>
        </View>
      </View>
    </View>
  );
}
