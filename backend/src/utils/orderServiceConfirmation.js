const SERVICE_CONFIRMATION_FULFILLMENT_TYPES = ['offline_service', 'remote_service'];

function needsCustomerServiceConfirmation(order = {}) {
  return order.paymentStatus === 'paid'
    && order.status === 'pending'
    && ['paid', 'fulfilling'].includes(order.tradeStatus)
    && ['', 'none'].includes(order.refundStatus || 'none')
    && SERVICE_CONFIRMATION_FULFILLMENT_TYPES.includes(order.fulfillmentType)
    && (!order.desiredServiceDate || !String(order.serviceRequirements || '').trim());
}

function pendingServiceConfirmationQuery(userId) {
  return {
    user: userId,
    paymentStatus: 'paid',
    status: 'pending',
    tradeStatus: { $in: ['paid', 'fulfilling'] },
    refundStatus: { $in: ['', 'none', null] },
    fulfillmentType: { $in: SERVICE_CONFIRMATION_FULFILLMENT_TYPES },
    $or: [
      { desiredServiceDate: null },
      { desiredServiceDate: { $exists: false } },
      { serviceRequirements: '' },
      { serviceRequirements: { $exists: false } },
    ],
  };
}

module.exports = {
  SERVICE_CONFIRMATION_FULFILLMENT_TYPES,
  needsCustomerServiceConfirmation,
  pendingServiceConfirmationQuery,
};
