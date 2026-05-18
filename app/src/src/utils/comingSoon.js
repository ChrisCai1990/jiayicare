import { Alert } from 'react-native';

/**
 * 功能开发中提示 — 用于尚未实现的按钮
 * 用法：onPress={comingSoon}
 *       onPress={() => comingSoon('自定义标题')}
 */
export default function comingSoon(title) {
  const t = typeof title === 'string' ? title : '该功能';
  Alert.alert(
    `${t}开发中`,
    '此功能即将上线，敬请期待 🚧',
    [{ text: '知道了', style: 'default' }]
  );
}
