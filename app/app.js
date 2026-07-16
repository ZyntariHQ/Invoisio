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
  document.body.innerHTML = '<main class="shell"><p>Could not load the reporting summary.</p></main>';
});
