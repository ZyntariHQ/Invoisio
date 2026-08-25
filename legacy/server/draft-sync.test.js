const assert = require('assert');
const { buildDraftSyncCenter, classifyDraftSync, isConflict } = require('./draft-sync');

assert.strictEqual(isConflict({ baseRevision: 1, localRevision: 2, remoteRevision: 3 }), true);
assert.strictEqual(isConflict({ baseRevision: 1, localRevision: 2, remoteRevision: 1 }), false);

const conflicted = classifyDraftSync({ id: 'draft-1', baseRevision: 7, localRevision: 8, remoteRevision: 9 });
assert.strictEqual(conflicted.syncStatus, 'conflicted');
assert.ok(conflicted.recoveryActions.includes('duplicate-and-review'));

const failed = classifyDraftSync({ id: 'draft-2', baseRevision: 1, localRevision: 2, remoteRevision: 1, retryCount: 3 });
assert.strictEqual(failed.syncStatus, 'needs-recovery');
assert.ok(failed.recoveryActions.includes('retry-sync'));

const center = buildDraftSyncCenter([
  { id: 'draft-1', customer: 'Aster Foods', baseRevision: 7, localRevision: 8, updatedAt: '2026-08-16T10:00:00Z' },
  { id: 'draft-2', customer: 'Blue Market', baseRevision: 1, localRevision: 2, remoteRevision: 1, retryCount: 3, updatedAt: '2026-08-15T10:00:00Z' },
  { id: 'draft-3', customer: 'Civic Labs', baseRevision: 4, localRevision: 4, remoteRevision: 4, updatedAt: '2026-08-14T10:00:00Z' },
], [
  { id: 'draft-1', revision: 9, updatedAt: '2026-08-16T10:05:00Z' },
]);

assert.strictEqual(center.summary.total, 3);
assert.strictEqual(center.summary.conflicted, 1);
assert.strictEqual(center.summary['needs-recovery'], 1);
assert.strictEqual(center.summary.synced, 1);
assert.strictEqual(center.drafts[0].syncStatus, 'conflicted');
console.log('draft-sync tests passed');
