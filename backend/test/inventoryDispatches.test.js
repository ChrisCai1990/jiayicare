const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

test('staff request queues without stock change; assigned manager confirms once with customer address', async () => {
  const handlers = {}
  const material = { _id:'material', stock:4, inventoryTracking:{ kind:'consumable' }, linkedProductIds:[] }
  const customer = { _id:'customer', name:'客户甲', phone:'13800000000', deliveryAddress:'系统地址', assignedHealthManager:'manager' }
  const recorder = { _id:'recorder', tenantId:'tenant', role:'nutritionist' }
  const manager = { _id:'manager', tenantId:'tenant', role:'healthManager' }
  let request
  let entryCalls = 0
  const Dispatch = {
    findOne:async () => request,
    create:async row => { request = { _id:'dispatch', status:'pending', ...row }; return request },
    findOneAndUpdate:async (filter, update) => {
      if (request.status === 'completed') return null
      if (filter.status && filter.status !== request.status) return null
      Object.assign(request, update.$set)
      return request
    },
    updateOne:async () => {},
  }
  const mocks = {
    mongoose:{ isValidObjectId:value=>typeof value === 'string' && value.length > 0 },
    '../models/InventoryMaterial':{ findOne:async()=>material },
    '../models/Product':{},
    '../models/User':{ findOne:()=>({ select:()=>({ lean:async()=>customer }) }) },
    '../models/Admin':{ findOne:()=>({ select:()=>({ lean:async()=>null }) }), exists:async()=>true },
    '../models/Order':{},
    '../models/InventoryEntry':{},
    '../models/InventoryDispatchRequest':Dispatch,
  }
  const source = fs.readFileSync(require.resolve('../src/routes/inventoryDispatches'), 'utf8')
  const module = { exports:{} }
  vm.runInNewContext(source, { module, require:name=>mocks[name] || (()=>{ throw Error(name) })() })
  const router = { get(path, fn){ handlers[`GET ${path}`]=fn }, post(path, fn){ handlers[`POST ${path}`]=fn } }
  const queue = module.exports(router, async (req, res) => {
    entryCalls++
    assert.equal(req.inventoryConfirmedBy, 'manager')
    assert.equal(req.inventoryDelivery.deliveryAddress, '系统地址')
    assert.equal(req.inventoryActor._id, 'recorder')
    res.json({ success:true, data:{ _id:'entry' } })
  })
  const response = () => ({ code:200, status(code){ this.code=code; return this }, json(body){ this.body=body; return this } })
  const queued = response()
  await queue({ staff:recorder, body:{ requestId:'request-1234567890', type:'use', productId:'material', units:1,
    userId:'customer', delivery:{ method:'shipping' } } }, queued)
  assert.equal(queued.code, 202)
  assert.equal(material.stock, 4)
  assert.equal(request.delivery.deliveryAddress, '系统地址')
  const forbidden = response()
  await handlers['POST /dispatches/:id/complete']({ staff:recorder, params:{ id:'dispatch' }, body:{} }, forbidden)
  assert.equal(forbidden.code, 403)
  assert.equal(entryCalls, 0)
  const otherManager = response()
  await handlers['POST /dispatches/:id/complete']({ staff:{ _id:'other', tenantId:'tenant', role:'healthManager' }, params:{ id:'dispatch' }, body:{} }, otherManager)
  assert.equal(otherManager.code, 403)
  assert.equal(entryCalls, 0)
  const done = response()
  await handlers['POST /dispatches/:id/complete']({ staff:manager, params:{ id:'dispatch' }, body:{ carrier:'顺丰', trackingNo:'SF123' } }, done)
  assert.equal(done.body.success, true)
  assert.equal(request.status, 'completed')
  assert.equal(entryCalls, 1)
  const repeated = response()
  await handlers['POST /dispatches/:id/complete']({ staff:manager, params:{ id:'dispatch' }, body:{} }, repeated)
  assert.equal(repeated.body.repeated, true)
  assert.equal(entryCalls, 1)
})
