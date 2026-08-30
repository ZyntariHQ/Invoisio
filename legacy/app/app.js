const state = { report: null, activeView: 'merchant' };

function currency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function renderSummary(containerId, report) {
  const container = document.getElementById(containerId);
  if (!container || !report) return;

  container.innerHTML = `
    <article class="summary-tile">
      <div>Paid invoices</div>
      <strong>${report.totalPaidInvoices}</strong>
    </article>
    <article class="summary-tile">
      <div>Paid volume</div>
      <strong>${currency(report.totalPaidVolume)}</strong>
    </article>
    <article class="summary-tile">
      <div>Dominant usage</div>
      <strong>${report.xlmVsToken.dominant}</strong>
    </article>
    <article class="summary-tile">
      <div>Insight</div>
      <strong>${report.xlmVsToken.dominantDescription}</strong>
    </article>
  `;
}

function renderBarChart(items, targetId, labelKey = 'asset') {
  const container = document.getElementById(targetId);
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<p>No paid invoices were found for this view.</p>';
    return;
  }

  const maxVolume = Math.max(...items.map((item) => item.volume || 0), 1);
  container.innerHTML = items
    .map((item) => {
      const percentage = Math.round(((item.volume || 0) / maxVolume) * 100);
      const label = item[labelKey] || item.asset || item.network || 'Unknown';
      return `
        <div class="chart-row">
          <span>${label}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${percentage}%"></div></div>
          <span>${currency(item.volume || 0)}</span>
        </div>
      `;
    })
    .join('');
}

function renderFunnel(funnel, targetId) {
  const container = document.getElementById(targetId);
  if (!container) return;

  container.innerHTML = funnel
    .map((step) => `
      <div class="chart-row">
        <span>${step.stage}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(step.conversionRate, 100)}%"></div></div>
        <span>${step.count}</span>
      </div>
    `)
    .join('');
}

function renderTimeToPay(metrics, targetId) {
  const container = document.getElementById(targetId);
  if (!container) return;

  const summary = metrics || { averageHours: 0, count: 0, method: 'No paid timestamps available' };
  container.innerHTML = `
    <div class="summary-tile">
      <div>Average time-to-pay</div>
      <strong>${summary.averageHours} hrs</strong>
    </div>
    <div class="summary-tile">
      <div>Computed from</div>
      <strong>${summary.method}</strong>
    </div>
    <div class="summary-tile">
      <div>Included paid invoices</div>
      <strong>${summary.count}</strong>
    </div>
  `;
}

function renderMerchantView(report) {
  renderSummary('merchant-summary', report);
  renderFunnel(report.conversionMetrics.funnel, 'merchant-funnel');
  renderBarChart(report.assetBreakdown.slice(0, 5), 'merchant-asset-chart', 'asset');
}

function renderAdminView(report) {
  renderSummary('admin-summary', report);
  renderBarChart(report.assetBreakdown.slice(0, 5), 'admin-asset-chart', 'asset');
  renderBarChart(report.networkBreakdown.slice(0, 5), 'admin-network-chart', 'network');
  renderFunnel(report.conversionMetrics.funnel, 'admin-funnel');
  renderTimeToPay(report.conversionMetrics.timeToPay, 'admin-time-to-pay');
}

async function loadReport() {
  const response = await fetch('/api/asset-report');
  const report = await response.json();
  state.report = report;
  renderMerchantView(report);
  renderAdminView(report);
}

function activateView(view) {
  state.activeView = view;
  document.getElementById('merchant-view').classList.toggle('hidden', view !== 'merchant');
  document.getElementById('admin-view').classList.toggle('hidden', view !== 'admin');
  document.querySelectorAll('.toggle-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
}

document.querySelectorAll('.toggle-button').forEach((button) => {
  button.addEventListener('click', () => activateView(button.dataset.view));
});

loadReport().catch((error) => {
  console.error('Failed to load reporting data', error);
  document.querySelectorAll('.chart-list, .summary-grid').forEach((container) => {
    if (!container.closest('#draft-sync-center')) {
      container.innerHTML = '<p>Could not load the reporting summary.</p>';
    }
  });
});

const sampleLocalDrafts = [
  {
    id: 'draft-1042',
    customer: 'Aster Foods',
    amount: 1280,
    baseRevision: 7,
    localRevision: 8,
    remoteRevision: 9,
    updatedAt: '2026-08-16T15:40:00Z',
    lastSyncAttemptAt: '2026-08-16T15:42:00Z',
    retryCount: 1,
  },
  {
    id: 'draft-1039',
    customer: 'Blue Market',
    amount: 640,
    baseRevision: 3,
    localRevision: 4,
    remoteRevision: 3,
    updatedAt: '2026-08-16T12:10:00Z',
    lastSyncAttemptAt: '2026-08-16T12:12:00Z',
    retryCount: 3,
  },
  {
    id: 'draft-1037',
    customer: 'Civic Labs',
    amount: 410,
    baseRevision: 5,
    localRevision: 6,
    remoteRevision: 5,
    updatedAt: '2026-08-15T19:20:00Z',
    retryCount: 0,
  },
];

function classifyDraftSync(draft) {
  const localChanged = draft.localRevision !== draft.baseRevision;
  const remoteChanged = draft.remoteRevision !== draft.baseRevision;
  const conflicted = localChanged && remoteChanged && draft.localRevision !== draft.remoteRevision;

  if (conflicted) {
    return { ...draft, syncStatus: 'conflicted', statusLabel: 'Conflict detected', severity: 'danger', actions: ['Compare versions', 'Keep local', 'Use server copy'] };
  }
  if (draft.retryCount >= 3) {
    return { ...draft, syncStatus: 'needs-recovery', statusLabel: 'Manual recovery needed', severity: 'warning', actions: ['Retry sync', 'Duplicate draft', 'Discard local'] };
  }
  if (localChanged) {
    return { ...draft, syncStatus: 'unsynced', statusLabel: 'Unsynced', severity: 'info', actions: ['Sync when online', 'Keep editing'] };
  }
  return { ...draft, syncStatus: 'synced', statusLabel: 'Synced', severity: 'success', actions: [] };
}

function renderDraftSyncCenter() {
  const summaryContainer = document.getElementById('draft-sync-summary');
  const listContainer = document.getElementById('draft-sync-list');
  if (!summaryContainer || !listContainer) return;

  const drafts = sampleLocalDrafts.map(classifyDraftSync);
  const counts = drafts.reduce((totals, draft) => {
    totals[draft.syncStatus] = (totals[draft.syncStatus] || 0) + 1;
    return totals;
  }, { unsynced: 0, conflicted: 0, 'needs-recovery': 0 });

  summaryContainer.innerHTML = `
    <article class="summary-tile"><div>Unsynced drafts</div><strong>${counts.unsynced}</strong></article>
    <article class="summary-tile danger"><div>Conflicts</div><strong>${counts.conflicted}</strong></article>
    <article class="summary-tile warning"><div>Needs recovery</div><strong>${counts['needs-recovery']}</strong></article>
  `;

  listContainer.innerHTML = drafts.map((draft) => `
    <article class="draft-card ${draft.severity}">
      <div>
        <div class="draft-title">${draft.customer} · ${currency(draft.amount)}</div>
        <p>${draft.statusLabel}: ${draft.syncStatus === 'conflicted'
          ? 'local and server revisions diverged, so sync is paused until reviewed.'
          : draft.syncStatus === 'needs-recovery'
            ? 'automatic sync hit the retry limit and needs a decision.'
            : 'saved on this device and queued for the next connection.'}</p>
        <small>Local rev ${draft.localRevision} · Server rev ${draft.remoteRevision} · Last edited ${new Date(draft.updatedAt).toLocaleString()}</small>
      </div>
      <div class="recovery-actions">
        ${draft.actions.map((action) => `<button type="button">${action}</button>`).join('')}
      </div>
    </article>
  `).join('');
}

renderDraftSyncCenter();
