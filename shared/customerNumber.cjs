// MongoDB assigns every customer a unique ObjectId at creation, including legacy accounts.
// Present that stable identity as a customer number without a migration or counter races.
function formatCustomerNumber(id) {
  const value = String(id?._id || id || '').toLowerCase();
  return /^[a-f\d]{24}$/.test(value) ? `KH-${value.toUpperCase()}` : '';
}

function parseCustomerNumber(value) {
  const match = /^KH-([A-F\d]{24})$/i.exec(String(value || '').trim());
  return match ? match[1].toLowerCase() : '';
}

module.exports = { formatCustomerNumber, parseCustomerNumber };
