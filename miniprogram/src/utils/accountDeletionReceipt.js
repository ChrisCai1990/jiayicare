import Taro from '@tarojs/taro';
const key = 'jy_deletion_receipt';
export function saveDeletionReceipt(receipt, userId) {
  if (!receipt?.token) throw new Error('注销查询凭证缺失，请重新读取申请状态');
  const value = { ...receipt, userId: String(userId || '') };
  Taro.setStorageSync(key, value);
  if (Taro.getStorageSync(key)?.token !== receipt.token) throw new Error('查询凭证未能保存，请重新读取申请状态');
}
export function loadDeletionReceipt() {
  try { return Taro.getStorageSync(key) || null; } catch { return null; }
}
