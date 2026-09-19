const test = require('node:test');
const assert = require('node:assert/strict');
const Message = require('../src/models/Message');
const Order = require('../src/models/Order');
const { buildOrderServiceContext } = require('../src/utils/aiMessageFallback');

test('planner follow-up uses nutrition shipping context while preserving medication and consultation behavior', async () => {
  const findMessage = Message.findOne; const findOrder = Order.findOne;
  let order;
  try {
    Message.findOne = () => ({ sort: () => ({ select: () => ({ lean: async () => ({ action: { orderId: 'order' } }) }) }) });
    Order.findOne = filter => {
      assert.equal(filter.user, 'customer'); assert.equal(filter._id, 'order');
      return { select: fields => {
        assert.match(fields, /serviceWorkflowSnapshot/); assert.match(fields, /fulfillmentType/);
        return { lean: async () => order };
      } };
    };
    order = { serviceName: '营养改变生活', note: '客户提供的配送需求；健康基金抵扣¥1', fulfillmentType: 'offline_service', serviceWorkflowSnapshot: { key: 'nutrition_intervention' } };
    const content = await buildOrderServiceContext('customer', 'customer_planner');
    assert.match(content, /仓库安排发货/); assert.match(content, /已经提供的信息不要重复询问/);
    assert.match(content, /不要求客户确认具体服务内容或预约时间/);
    assert.match(content, /不得编造库存、物流单号、发货时间或送达日期/);
    assert.match(content, /不能说已更新系统/); assert.doesNotMatch(content, /健康基金抵扣/);
    order = { serviceName: '口溶粉', serviceWorkflowSnapshot: { key: 'supplement_supply' } };
    assert.match(await buildOrderServiceContext('customer', 'customer_planner'), /营养实物订单/);
    order = { serviceName: '营养评估服务', serviceWorkflowSnapshot: { key: 'nutrition_intervention' }, fulfillmentType: 'remote_service' };
    assert.equal(await buildOrderServiceContext('customer', 'customer_planner'), '');
    order = { serviceName: '代配药服务' };
    assert.match(await buildOrderServiceContext('customer', 'customer_planner'), /药品通用名/);
    order = null;
    assert.equal(await buildOrderServiceContext('customer', 'customer_planner'), '');
  } finally { Message.findOne = findMessage; Order.findOne = findOrder; }
});
