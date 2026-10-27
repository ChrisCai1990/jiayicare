// Read-only residual audit. This is one completion gate, not proof of file/backup erasure.
const { RULES } = require('./accountDeletionPersonalData');
function userReferencePaths(schema, prefix = '', seen = new Set()) {
  if (!schema || seen.has(schema)) return [];
  const nextSeen = new Set(seen); nextSeen.add(schema);
  const found = [];
  schema.eachPath((name, type) => {
    const full = prefix + name;
    if (type.options?.ref === 'User' || type.caster?.options?.ref === 'User') found.push(full);
    if (type.schema) found.push(...userReferencePaths(type.schema, full + '.', nextSeen));
  });
  return [...new Set(found)];
}
async function auditResidualReferences({ models, subject }) {
  if (!subject?.userId?.toHexString || !subject?.tenantId?.toHexString) throw new Error('Valid subject required');
  const findings = [];
  for (const [name, Model] of Object.entries(models)) {
    // The privacy request is an internal receipt/tombstone record, never a usable login.
    if (['AccountDeletionRequest', 'AccountDeletionJob'].includes(name)) continue;
    const paths = new Set(userReferencePaths(Model.schema));
    for (const rule of RULES.filter(r => r.name === name)) paths.add(rule.path);
    if (!paths.size) continue;
    const filter = { $or: [...paths].map(field => ({ [field]: subject.userId })) };
    // Cross-tenant references must be surfaced, not erased or silently ignored.
    const count = await Model.collection.countDocuments(filter);
    if (count) findings.push({ model: name, count, paths: [...paths] });
  }
  return { scope: 'registered-model-user-references', clear: findings.length === 0, findings,
    limitation: 'Does not certify unmodeled collections, embedded name/contact copies, external files or backups.' };
}
module.exports = { userReferencePaths, auditResidualReferences };
