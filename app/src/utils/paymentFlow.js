// SDK callbacks are hints. Only authenticated server status confirms payment.
async function confirmOrderPayment(orderId, status, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (!orderId) throw new Error('缺少订单编号，请在我的订单核对');
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await status(orderId);
    if (!result?.success) throw new Error(result?.message || '付款状态暂时无法确认');
    const order = result.data?.order;
    if (order?.paymentStatus === 'paid' && result.data?.checkoutPaid !== false) return order;
    if (['closed', 'refunded'].includes(order?.tradeStatus) || order?.paymentStatus === 'refunded') {
      throw new Error('订单已关闭或退款，请刷新我的订单');
    }
    if (attempt < 4) await sleep(1200);
  }
  throw new Error('付款结果待确认，请在我的订单刷新状态，勿重复购买');
}
async function finishCheckout(result, requestPayment, status, sleep) {
  if (!result?.success) throw new Error(result?.message || '提交失败');
  const data = result.data || {};
  const orderId = data.orderId || data.order?._id;
  let sdkError;
  if (data.paymentParams) {
    try { await requestPayment(data.paymentParams); } catch (error) { sdkError = error; }
  } else if (!data.alreadyPaid && data.paymentStatus !== 'paid') {
    throw new Error('未取得付款参数，请在我的订单继续支付');
  }
  try { return await confirmOrderPayment(orderId, status, sleep); }
  catch (error) {
    if (sdkError) throw new Error('付款未确认或已取消，请在我的订单查看或继续支付');
    throw error;
  }
}
module.exports = { confirmOrderPayment, finishCheckout };
