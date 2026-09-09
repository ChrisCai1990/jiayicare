const crypto = require('crypto');

const AUTHORIZATION_STATUSES = new Set(['not_required', 'draft', 'submitted', 'supplement', 'reviewing', 'approved', 'partially_approved', 'denied', 'cancelled']);
const CLAIM_STATUSES = new Set(['draft', 'submitted', 'supplement', 'reviewing', 'approved', 'partially_approved', 'denied', 'paid', 'closed']);

class InsuranceConnector {
  constructor(provider) { this.provider = provider; }
  async verifyEligibility() { throw new Error(`${this.provider} eligibility connector is not configured`); }
  async searchProviderNetwork() { throw new Error(`${this.provider} provider-network connector is not configured`); }
  async submitAuthorization() { throw new Error(`${this.provider} authorization connector is not configured`); }
  async submitClaim() { throw new Error(`${this.provider} claim connector is not configured`); }
  async getCaseStatus() { throw new Error(`${this.provider} case-status connector is not configured`); }
}

class ManualInsuranceConnector extends InsuranceConnector {
  constructor() { super('manual'); }
  async verifyEligibility(input) { return { mode: 'manual', status: 'requires_staff_review', input }; }
}

const connectors = new Map([['manual', new ManualInsuranceConnector()]]);
function registerInsuranceConnector(provider, connector) { connectors.set(String(provider).toLowerCase(), connector); }
function getInsuranceConnector(provider = 'manual') { return connectors.get(String(provider).toLowerCase()) || connectors.get('manual'); }

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = String(signature).replace(/^sha256=/, '');
  return expected.length === received.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

module.exports = { InsuranceConnector, ManualInsuranceConnector, AUTHORIZATION_STATUSES, CLAIM_STATUSES, registerInsuranceConnector, getInsuranceConnector, verifyWebhookSignature };
