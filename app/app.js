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

function renderBarChart(items, targetId) {
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
      return `
        <div class="chart-row">
          <span>${item.asset || item.network || 'Unknown'}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${percentage}%"></div></div>
          <span>${currency(item.volume || 0)}</span>
        </div>
      `;
    })
    .join('');
}

function renderMerchantView(report) {
  renderSummary('merchant-summary', report);
  renderBarChart(report.assetBreakdown.slice(0, 5), 'merchant-asset-chart');
}

function renderAdminView(report) {
  renderSummary('admin-summary', report);
  renderBarChart(report.assetBreakdown.slice(0, 5), 'admin-asset-chart');
  renderBarChart(report.networkBreakdown.slice(0, 5), 'admin-network-chart');
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
  document.body.innerHTML = '<main class="shell"><p>Could not load the reporting summary.</p></main>';
});
