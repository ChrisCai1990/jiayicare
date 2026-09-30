export async function prepareNativePayment() {
  throw new Error('请在嘉医汇App或微信小程序中完成支付');
}
export async function completeNativePayment() {
  throw new Error('请在嘉医汇App或微信小程序中查看订单并支付');
}
