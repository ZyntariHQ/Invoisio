const assert = require('assert');
const { buildAssetReport } = require('./asset-reporting');

const report = buildAssetReport([
  { id: 'inv-1', status: 'paid', amount: 120, asset_type: 'XLM', network: 'stellar' },
  { id: 'inv-2', status: 'paid', amount: 80, asset_type: 'USDC', network: 'stellar' },
  { id: 'inv-3', status: 'paid', amount: 40, asset_type: 'USDT', network: 'ethereum' },
  { id: 'inv-4', status: 'paid', amount: 18, asset_type: '', network: '' }
]);

assert.strictEqual(report.totalPaidInvoices, 4);
assert.strictEqual(report.xlmVsToken.dominant, 'XLM');
assert.strictEqual(report.assetBreakdown[0].asset, 'XLM');
assert.strictEqual(report.networkBreakdown[0].network, 'stellar');
assert.ok(report.assetBreakdown.some((item) => item.asset === 'Unknown'));
assert.ok(report.networkBreakdown.some((item) => item.network === 'Unknown'));
console.log('asset-reporting tests passed');
