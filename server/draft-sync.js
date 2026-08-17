const RETRY_LIMIT = 3;

function parseTime(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeDraft(draft = {}) {
  return {
    ...draft,
    id: draft.id || draft.localId || draft.remoteId,
    baseRevision: draft.baseRevision ?? draft.base_rev ?? null,
    localRevision: draft.localRevision ?? draft.revision ?? null,
    remoteRevision: draft.remoteRevision ?? draft.serverRevision ?? null,
    updatedAt: draft.updatedAt || draft.updated_at || null,
    lastSyncAttemptAt: draft.lastSyncAttemptAt || draft.last_sync_attempt_at || null,
    retryCount: Number(draft.retryCount ?? draft.retry_count ?? 0),
  };
}

function hasLocalChanges(draft) {
  if (draft.dirty === true || draft.isDirty === true || draft.status === 'unsynced') return true;
  return draft.localRevision !== null && draft.localRevision !== draft.baseRevision;
}

function hasRemoteChanges(draft) {
  return draft.remoteRevision !== null && draft.remoteRevision !== draft.baseRevision;
}

function isConflict(draft) {
  return hasLocalChanges(draft) && hasRemoteChanges(draft) && draft.localRevision !== draft.remoteRevision;
}

function classifyDraftSync(draftInput) {
  const draft = normalizeDraft(draftInput);
  const failedRepeatedly = draft.retryCount >= RETRY_LIMIT;

  if (draft.status === 'conflicted' || isConflict(draft)) {
    return {
      ...draft,
      syncStatus: 'conflicted',
      severity: 'danger',
      recoveryActions: ['keep-local-copy', 'use-server-copy', 'duplicate-and-review'],
      message: 'Local and server versions both changed. Review both copies before syncing.',
    };
  }

  if (failedRepeatedly || draft.status === 'failed') {
    return {
      ...draft,
      syncStatus: 'needs-recovery',
      severity: 'warning',
      recoveryActions: ['retry-sync', 'duplicate-and-review', 'discard-local-copy'],
      message: 'Automatic sync failed repeatedly. Choose a recovery action when back online.',
    };
  }

  if (hasLocalChanges(draft)) {
    return {
      ...draft,
      syncStatus: 'unsynced',
      severity: 'info',
      recoveryActions: ['sync-now', 'keep-editing-offline'],
      message: 'Saved locally and waiting for a safe sync.',
    };
  }

  return {
    ...draft,
    syncStatus: 'synced',
    severity: 'success',
    recoveryActions: [],
    message: 'Draft is up to date on this device and the server.',
  };
}

function buildDraftSyncCenter(localDrafts = [], remoteDrafts = []) {
  const remoteById = new Map((Array.isArray(remoteDrafts) ? remoteDrafts : []).map((draft) => [draft.id || draft.remoteId, draft]));
  const drafts = (Array.isArray(localDrafts) ? localDrafts : []).map((localDraft) => {
    const remoteDraft = remoteById.get(localDraft.id || localDraft.remoteId);
    return classifyDraftSync({
      ...localDraft,
      remoteRevision: remoteDraft?.revision ?? remoteDraft?.remoteRevision ?? localDraft.remoteRevision,
      remoteUpdatedAt: remoteDraft?.updatedAt ?? remoteDraft?.updated_at,
    });
  }).sort((left, right) => parseTime(right.updatedAt) - parseTime(left.updatedAt));

  const summary = drafts.reduce((counts, draft) => {
    counts.total += 1;
    counts[draft.syncStatus] = (counts[draft.syncStatus] || 0) + 1;
    return counts;
  }, { total: 0, synced: 0, unsynced: 0, conflicted: 0, 'needs-recovery': 0 });

  return { summary, drafts };
}

module.exports = {
  RETRY_LIMIT,
  buildDraftSyncCenter,
  classifyDraftSync,
  isConflict,
};
