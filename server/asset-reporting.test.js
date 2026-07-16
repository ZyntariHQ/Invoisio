const assert = require('assert');
const { buildAssetReport } = require('./asset-reporting');

const report = buildAssetReport([
  { id: 'inv-1', status: 'paid', amount: 120, asset_type: 'XLM', network: 'stellar', created_at: '2024-01-01T10:00:00Z', shared_at: '2024-01-01T10:15:00Z', viewed_at: '2024-01-01T10:30:00Z', paid_at: '2024-01-01T11:00:00Z' },
  { id: 'inv-2', status: 'paid', amount: 80, asset_type: 'USDC', network: 'stellar', created_at: '2024-01-02T10:00:00Z', shared_at: '2024-01-02T10:10:00Z', paid_at: '2024-01-02T10:45:00Z' },
  { id: 'inv-3', status: 'pending', amount: 40, asset_type: 'USDT', network: 'ethereum', created_at: '2024-01-03T10:00:00Z', shared_at: '2024-01-03T10:20:00Z' },
  { id: 'inv-4', status: 'paid', amount: 18, asset_type: '', network: '', created_at: '2024-01-04T09:00:00Z', paid_at: '2024-01-04T09:30:00Z' }
]);

assert.strictEqual(report.totalPaidInvoices, 3);
assert.strictEqual(report.xlmVsToken.dominant, 'XLM');
assert.strictEqual(report.assetBreakdown[0].asset, 'XLM');
assert.strictEqual(report.networkBreakdown[0].network, 'stellar');
assert.ok(report.assetBreakdown.some((item) => item.asset === 'Unknown'));
assert.ok(report.networkBreakdown.some((item) => item.network === 'Unknown'));
assert.strictEqual(report.conversionMetrics.createdCount, 4);
assert.strictEqual(report.conversionMetrics.sharedCount, 3);
assert.strictEqual(report.conversionMetrics.viewedCount, 1);
assert.strictEqual(report.conversionMetrics.paidCount, 3);
assert.strictEqual(report.conversionMetrics.funnel[1].stage, 'Shared');
assert.strictEqual(report.conversionMetrics.funnel[3].stage, 'Paid');
assert.strictEqual(report.conversionMetrics.timeToPay.unit, 'hours');
assert.strictEqual(report.conversionMetrics.timeToPay.count, 3);
assert.strictEqual(report.conversionMetrics.timeToPay.averageHours, 0.75);
assert.strictEqual(report.conversionMetrics.timeToPay.method, 'Difference between created_at and paid_at timestamps');
console.log('asset-reporting tests passed');
