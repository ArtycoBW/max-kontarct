// Usage after a verified backup: node scripts/repair-deal-document-stage.cjs DEAL_UUID VERSION [--apply]
// Defaults to read-only assessment. Never approves or signs on behalf of a party.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const { loadDocumentStage } = require('../apps/api/dist/files/document-readiness');
const [dealId, version, mode] = process.argv.slice(2);
assert.match(dealId ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
assert.match(version ?? '', /^[1-9][0-9]*$/);
assert.ok(mode === undefined || mode === '--apply');
const prisma = new PrismaClient();
const fingerprint = value => createHash('sha256').update(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item)).digest('hex');
async function protectedData(tx) {
  return tx.deal.findUniqueOrThrow({ where: { id: dealId }, select: {
    files: { orderBy: { id: 'asc' } }, parties: { orderBy: { id: 'asc' } },
    versions: { orderBy: { id: 'asc' }, include: { approvals: { orderBy: { id: 'asc' } } } },
    signatures: { orderBy: { id: 'asc' } }, artifacts: { orderBy: { id: 'asc' } },
  } });
}
async function main() {
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM deals WHERE id = ${dealId}::uuid FOR UPDATE`;
    const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, select: { status: true, updatedAt: true } });
    const before = await protectedData(tx);
    const latest = [...before.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
    assert.equal(latest?.versionNumber, Number(version), 'Version changed; repair cancelled');
    assert.equal(before.signatures.length, 0, 'Signed deals cannot be repaired');
    assert.equal(latest.frozenAt, null, 'Frozen versions cannot be repaired');
    assert.ok(before.versions.every(item => item.approvals.length === 0), 'Existing approvals require manual review');
    const target = await loadDocumentStage(tx, dealId);
    assert.equal(target, 'TERMS_REVIEW', 'Required documents are not accepted for both parties');
    const summary = { dealId, version: Number(version), before: deal.status, target, applied: false, files: before.files.length, protectedDataHash: fingerprint(before) };
    if (deal.status === target || mode !== '--apply') return summary;
    assert.ok(['COUNTERPARTY_JOINED', 'DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW'].includes(deal.status), 'Unexpected deal stage');
    const updated = await tx.deal.updateMany({ where: { id: dealId, status: deal.status, updatedAt: deal.updatedAt }, data: { status: target } });
    assert.equal(updated.count, 1, 'Concurrent update; repair cancelled');
    await tx.auditEvent.create({ data: { entityId: dealId, entityType: 'Deal', eventType: 'DEAL_DOCUMENT_STAGE_REPAIRED', metadata: { previousStatus: deal.status, nextStatus: target, versionId: latest.id, reason: 'Documents accepted before agreement started' } } });
    assert.equal(fingerprint(await protectedData(tx)), summary.protectedDataHash, 'Protected deal data changed; rolling back');
    return { ...summary, applied: true };
  });
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : 'Repair failed; transaction rolled back'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
