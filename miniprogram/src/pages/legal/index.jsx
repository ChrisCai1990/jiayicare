import React from 'react';
import { View, Text } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import { colors, spacing, radius } from '../../theme';

// 内容与 app/src/screens/legal/LegalScreen.js 完全一致（项目自有法律文本）
const CONTENT = {
  terms: {
    title: '用户协议',
    sections: [
      { heading: '1. 接受条款', body: '欢迎使用嘉医汇（以下简称"本应用"），由杭州嘉静佑辰科技有限公司运营。您在使用本应用前，请仔细阅读本用户协议。一旦您使用本应用，即表示您已阅读并同意遵守本协议的全部条款。' },
      { heading: '2. 服务内容', body: '本应用提供健康数据管理、用药提醒、随访任务、AI 健康咨询及医生/健管师沟通等功能。所有服务内容可能因地区、套餐类型不同而有所差异。' },
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
      { heading: '2. 信息使用', body: '您的信息仅用于：提供个性化健康管理服务、与您的医生/健管师共享必要健康数据、发送服务通知与提醒、分析改善产品功能。我们不会将您的个人信息出售给第三方。' },
      { heading: '3. 健康数据保护', body: '健康数据属于敏感信息，受到严格保护。所有健康数据均经过加密存储，仅您本人及您明确授权的医疗人员可访问。我们不会将健康数据用于任何商业目的。' },
      { heading: '4. 数据存储与安全', body: '我们采用行业标准的安全措施（SSL 传输加密、JWT 身份验证、数据库加密）保护您的数据。数据存储于境内合规的云服务器，符合《网络安全法》及《个人信息保护法》要求。' },
      { heading: '5. 第三方服务', body: '本应用可能使用第三方服务（如短信验证码服务商）。这些第三方服务商有其独立的隐私政策，我们会要求其遵守与我们相同的数据保护标准。' },
      { heading: '6. 您的权利', body: '您有权访问、更正、删除您的个人信息，并有权撤回对数据处理的同意。如需行使上述权利，请联系客服：17742039618。' },
      { heading: '7. 未成年人保护', body: '本应用不面向 18 周岁以下未成年人。如您是未成年人的监护人，请确保监护对象不单独使用本应用。' },
      { heading: '8. 隐私政策更新', body: '本隐私政策可能不定期更新。重大变更时，我们将通过应用内通知或短信方式告知您。' },
    ],
  },
  disclaimer: {
    title: '免责声明',
    sections: [
      { heading: '1. 医疗信息免责', body: '本应用提供的所有健康信息、AI 助手回复及健康建议均仅供参考，不构成医疗诊断、治疗建议或处方。任何健康问题请以执业医师的专业判断为准。' },
      { heading: '2. AI 健康助手限制', body: 'AI 健康助手基于通用医学知识库，无法替代面诊。其回复不能作为诊断依据，不能替代专业医疗建议。如您有紧急健康状况，请立即拨打 120 或前往医院急诊。' },
      { heading: '3. 数据准确性', body: '本应用中的健康评分、趋势分析等数据由算法自动生成，仅供参考，不代表医学评估结论。健康指标的异常提示不能替代专业医学检查与诊断。' },
      { heading: '4. 服务可用性', body: '本应用可能因服务器维护、网络故障、不可抗力等原因出现短暂不可用情况。我们将尽力保证服务稳定性，但不对因此造成的任何损失承担责任。' },
      { heading: '5. 第三方链接', body: '本应用可能包含指向第三方网站或服务的链接。我们对第三方内容的准确性、合法性及安全性不承担任何责任。' },
      { heading: '6. 紧急情况声明', body: '本应用不提供紧急医疗救援服务。如遇生命危险或紧急医疗情况，请立即拨打急救电话 120，或前往最近的医疗机构就诊。' },
    ],
  },
};

export default function LegalPage() {
  const router = useRouter();
  const type = router.params?.type || 'terms';
  const doc = CONTENT[type] || CONTENT.terms;

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ backgroundColor: '#fff', padding: `${spacing.lg}px`, borderBottom: `1px solid ${colors.borderLight}` }}>
        <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary, display: 'block' }}>{doc.title}</Text>
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
          <Text style={{ fontSize: '12px', color: colors.textMuted }}>客服电话：17742039618</Text>
        </View>
      </View>
    </View>
  );
}
