function removeCustomerRoleLabel(content, name) {
  if (!name) return content;
  return String(content || '').replaceAll(`@${name}（客户）`, `@${name}`);
}

function forCustomer(message, customerName) {
  return {
    ...message,
    content: removeCustomerRoleLabel(message.content, customerName),
    quote: message.quote?.content ? { ...message.quote, content: removeCustomerRoleLabel(message.quote.content, customerName) } : message.quote,
  };
}

module.exports = { removeCustomerRoleLabel, forCustomer };
