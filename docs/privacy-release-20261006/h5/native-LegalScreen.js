import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme';

const CONTENT = {
  terms: {
    title: '用户协议',
    sections: [
      {
        heading: '1. 接受条款',
        body: '欢迎使用嘉医汇健康管家（以下简称“本应用”）。本应用由杭州嘉静佑辰科技有限公司运营平台，杭州嘉医汇健康管理有限公司提供健康管理服务。您在使用本应用前，请仔细阅读本用户协议。一旦您使用本应用，即表示您已阅读并同意遵守本协议的全部条款。',
      },
      {
        heading: '2. 服务内容',
        body: '本应用提供健康档案整理、体检信息整理、健康数据趋势展示、生活方式管理、健康提醒、服务需求梳理及就医协助等非医疗健康管理功能，不提供疾病诊断、治疗、处方、线上复诊或检查开单。',
      },
      {
        heading: '3. 用户注册与账号安全',
        body: '您需使用真实手机号注册账号。请妥善保管账号及验证码，不得转让或出借给他人使用。如发现账号被盗用，请立即联系客服。',
      },
      {
        heading: '4. 使用规范',
        body: '您不得利用本应用从事任何违法活动，不得上传虚假健康信息，不得干扰系统正常运行，不得侵犯他人合法权益。',
      },
      {
        heading: '5. 知识产权',
        body: '本应用的所有内容，包括但不限于文字、图形、图标、界面设计、程序代码，均受知识产权法律保护，未经授权不得复制、修改或传播。',
      },
      {
        heading: '6. 服务变更与中止',
        body: '我们有权在必要时对服务内容进行调整，包括功能增减、价格变化等。如服务发生重大变更，我们将提前通知用户。',
      },
      {
        heading: '7. 协议修改',
        body: '本协议可能随时修订，修订后的协议将在应用内公布。继续使用本应用即视为接受修订后的协议。',
      },
      {
        heading: '8. 适用法律',
        body: '本协议受中华人民共和国法律管辖。因本协议产生的争议，双方应友好协商解决；协商不成的，提交有管辖权的人民法院解决。',
      },
    ],
  },
  privacy: {
    "title": "隐私政策",
    "sections": [
        {
            "heading": "适用范围与运营主体",
            "body": "嘉医汇健康管家平台由杭州嘉静佑辰科技有限公司运营，杭州嘉医汇健康管理有限公司提供健康管理服务。我们重视并保护您的个人信息和健康相关信息。本政策说明我们如何收集、使用、保存和保护您的信息，以及您如何行使相关权利。"
        },
        {
            "heading": "1. 我们收集的信息",
            "body": "为提供健康档案整理、体检信息整理、健康数据趋势展示、生活方式管理、健康提醒、服务需求梳理及就医协助等服务，我们可能收集您主动提供的注册与基础信息、健康相关信息，以及保障服务运行与安全所需的设备和日志信息。使用手机号登录时，我们处理手机号和验证码，用于身份验证及登录会话管理。建立档案时，处理姓名、性别、出生日期、证件类型和号码等资料；报告、健康记录和沟通功能处理您提交的文件、记录、文字及语音。档案还可能包含您向服务人员提供的教育程度、所在企业、职业与婚姻信息。家庭成员管理处理您填写的成员姓名、关系、联系方式、生日、性别及备注。民族与宗教信仰由您自愿提供，用于尊重文化及宗教习俗，避免健康管理服务安排触及个人禁忌；未填写不影响基础服务。服务人员录入前应说明用途，并确认您愿意提供。\n\n健康相关信息属于敏感个人信息。我们仅在实现相应服务所必需的范围内处理，并在需要时取得您的单独同意。\n\n当您使用官网“AI咨询准备助手”并主动提交线下沟通申请时，我们会在取得您同意后处理姓名、手机号、所在城市、方便联系时间和您填写的非医疗咨询方向或摘要，用于确认健康管理服务安排。该入口不用于接收病历、症状、检查指标、报告或用药信息；请勿在其中提交此类信息。"
        },
        {
            "heading": "2. 信息的使用目的",
            "body": "我们在必要范围内使用信息，用于提供和改进健康管理服务、展示健康数据趋势、发送服务通知与提醒、保障账号与服务安全，以及在您明确授权后向相应医生或健康管理人员提供必要信息。我们不会出售您的个人信息或健康相关信息。"
        },
        {
            "heading": "3. 健康信息与专业服务边界",
            "body": "嘉医汇提供非医疗健康管理服务，不提供疾病诊断、治疗、处方、线上复诊或检查开单。涉及医疗问题时，请以正规医疗机构和执业医师的专业判断为准。\n\n如您选择具体健康管理服务，或选择向医生、健康管理人员授权共享信息，我们将在服务页面告知处理目的、处理方式和信息类型，并在法律要求时取得您的单独同意。您可以按照适用功能的说明撤回授权；撤回不影响撤回前基于授权进行的处理。"
        },
        {
            "heading": "4. 信息存储与安全",
            "body": "我们采取合理的管理和技术措施保护信息安全，并将按照法律法规和业务所需的期限保存信息。官网线下沟通申请在未转化为正式服务关系的情况下，最长保存180日；超过保存期限或您提出有效删除请求后，我们将按适用法律法规处理相关信息。"
        },
        {
            "heading": "5. 平台、服务方与第三方服务",
            "body": "杭州嘉静佑辰科技有限公司负责平台运营、研发、运维及技术支持；杭州嘉医汇健康管理有限公司负责实际健康管理服务。双方仅在各自职责及实现相应服务所必需的范围内处理个人信息。涉及健康资料的授权共享，按本政策第3节执行，不因本次主体说明而扩大信息使用范围。为实现部分功能，我们也可能接入短信验证、云服务等第三方服务；我们会仅在实现对应功能所需的范围内向其提供必要信息，并要求其采取相应的数据保护措施。"
        },
        {
            "heading": "5.1 语音消息与麦克风",
            "body": "当您主动使用语音消息功能时，我们申请麦克风权限以录制语音，并在您发送后将语音文件和必要的会话信息提交至本应用服务端，供对应服务人员接收和播放。您可在系统设置中关闭麦克风权限，拒绝授权不影响文字沟通。语音中可能包含健康等敏感信息，请仅发送本次服务所需内容。您发送的语音不会自动转写。仅当您点击“转文字”并确认授权后，我们才将该条录音提交至阿里云智能语音服务识别，并将结果保存至当前会话供查看；该转写结果不自动用于AI回复。拒绝转写不影响原语音发送和播放。"
        },
        {
            "heading": "5.2 Android 华为系统推送",
            "body": "支持华为推送的 Android App 集成华为推送 SDK（Push Kit），用于将医护服务新消息通知发送至您的设备。在您主动开启系统通知后，本应用获取设备推送凭据（Push Token），并在服务端与当前账号、登录会话绑定，用于通知投递及未读角标同步。当前系统通知使用通用服务提醒，不附带健康报告或聊天正文。您可在 App 通知设置中关闭系统推送，也可通过手机系统设置关闭通知展示；退出账号时本应用解除该会话的设备绑定。小程序及普通网页不调用此原生推送能力。华为推送 SDK 的提供方为华为软件技术有限公司。依据其 Android SDK 隐私声明（2026年3月24日更新），SDK 为消息投递处理应用基本信息、设备型号、操作系统、系统设置及网络相关信息；系统设置、运营商、SSID 和 IP 地址仅在设备本地处理，不上传华为服务器。在非华为设备上，该服务可能关联启动 HMS Core 以建立推送连接和完成鉴权。SDK 的存储期限、境外旅行期间的消息路由及个人信息权利说明请参阅上述官方声明。本应用自身的 Push Token 账号绑定处理与 SDK 的信息处理分别适用前述说明。华为 SDK 对个人信息的处理说明：https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/sdk-data-security-0000001050042177。"
        },
        {
            "heading": "5.3 Android 微信分享",
            "body": "Android App 的微信分享功能使用微信 Open SDK，提供方为深圳市腾讯计算机系统有限公司。当您主动选择分享服务或邀请好友时，本应用向微信传递所选内容的标题、封面图片、服务或邀请链接及小程序页面路径；链接中可能包含用于识别服务分享或邀请关系的标识。SDK 会检查设备是否安装微信，以判断是否能够使用分享功能。您在微信中选择接收对象并确认发送，也可以取消分享。本应用不会因该分享操作自动附带您的健康报告或聊天内容。微信对相关信息的处理、保存及权利行使方式，请参阅《微信 Open SDK 个人信息处理规则》。\n\n官方规则：https://support.weixin.qq.com/cgi-bin/mmsupportacctnodeweb-bin/pages/RYiYJkLOrQwu0nb8"
        },
        {
            "heading": "6. 您的权利",
            "body": "在符合法律法规的前提下，您可以请求访问、更正、删除个人信息，撤回同意，申请注销账号，或咨询个人信息处理情况。账号注销申请可在 App 或小程序的“帮助与反馈”中提交。"
        },
        {
            "heading": "7. 未成年人保护",
            "body": "嘉医汇目前不面向18周岁以下未成年人提供独立服务。如涉及未成年人信息处理，将依照适用法律法规和监护人授权要求执行。"
        },
        {
            "heading": "8. 政策更新",
            "body": "如本政策发生重大变化，我们将通过官网、App 或其他适当方式提示您。更新后的政策以公开页面载明的版本和生效日期为准。"
        },
        {
            "heading": "9. 联系我们",
            "body": "平台运营方：杭州嘉静佑辰科技有限公司；健康管理服务提供方：杭州嘉医汇健康管理有限公司。\n\n平台隐私咨询及客服电话：19106761448\n\n健康管理服务联系地址：杭州市萧山区盈丰街道江峰商务名座1幢1015室"
        }
    ]
},
  disclaimer: {
    title: '免责声明',
    sections: [
      {
        heading: '1. 非医疗服务声明',
        body: '本应用仅提供非医疗健康管理服务，不提供疾病诊断、治疗、处方、线上复诊或检查开单。任何医疗问题请以正规医疗机构和执业医师的专业判断为准。',
      },
      {
        heading: '2. AI健康规划师限制',
        body: 'AI健康规划师仅负责健康管理需求梳理、目标规划和平台服务介绍，不提供医疗相关咨询。如您有身体不适或紧急健康状况，请及时就医或立即拨打120。',
      },
      {
        heading: '3. 数据准确性',
        body: '本应用中的健康评分、趋势分析等数据由算法自动生成，仅供参考，不代表医学评估结论。健康指标的异常提示不能替代专业医学检查与诊断。',
      },
      {
        heading: '4. 服务可用性',
        body: '本应用可能因服务器维护、网络故障、不可抗力等原因出现短暂不可用情况。我们将尽力保证服务稳定性，但不对因此造成的任何损失承担责任。',
      },
      {
        heading: '5. 第三方链接',
        body: '本应用可能包含指向第三方网站或服务的链接。我们对第三方内容的准确性、合法性及安全性不承担任何责任。',
      },
      {
        heading: '6. 紧急情况声明',
        body: '本应用不提供紧急医疗救援服务。如遇生命危险或紧急医疗情况，请立即拨打急救电话 120，或前往最近的医疗机构就诊。',
      },
    ],
  },
};

export default function LegalScreen({ navigation, route }) {
  const type = route?.params?.type || 'terms';
  const doc = CONTENT[type] || CONTENT.terms;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>{doc.title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.docTitle}>{doc.title}</Text>
          <Text style={styles.updateDate}>更新日期：{type === 'privacy' ? '2026年10月6日' : '2026年9月23日'}</Text>
        </View>

        <View style={styles.body}>
          {doc.sections.map((s, i) => (
            <View key={i} style={styles.section}>
              <Text style={styles.heading}>{s.heading}</Text>
              <Text style={styles.bodyText}>{s.body}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>嘉医汇健康管家 · 杭州嘉医汇健康管理有限公司</Text>
          <Text style={styles.footerText}>客服电话：19106761448</Text>
          <Text style={styles.footerText}>健康管理服务联系地址：杭州市萧山区盈丰街道江峰商务名座1幢1015室</Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  scroll: { flex: 1 },
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  docTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 },
  updateDate: { fontSize: 12, color: colors.textMuted },
  body: { padding: spacing.lg, gap: spacing.lg },
  section: {},
  heading: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  bodyText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  footer: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderLight,
    alignItems: 'center', gap: 4,
  },
  footerText: { fontSize: 12, color: colors.textMuted },
});
