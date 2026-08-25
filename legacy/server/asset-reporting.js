function toDisplayLabel(value, fallback = 'Unknown') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  return String(value);
}

function normalizeNetwork(value) {
  return toDisplayLabel(value, 'Unknown').toLowerCase();
}

function classifyAsset(asset) {
  const rawAsset = toDisplayLabel(asset, 'Unknown');
  const normalized = rawAsset.toLowerCase();
  if (normalized === 'xlm' || normalized === 'native' || normalized === 'stellar') {
    return 'XLM';
  }
  return 'Token';
}

function parseTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildAssetReport(invoices = []) {
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const paidInvoices = safeInvoices.filter((invoice) => {
    const status = toDisplayLabel(invoice?.status || invoice?.state, '').toLowerCase();
    return status === 'paid' || Boolean(invoice?.paid_at || invoice?.settled_at);
  });

  const assetBuckets = new Map();
  const networkBuckets = new Map();
  const xlmVsToken = {
    xlm: { count: 0, volume: 0 },
    token: { count: 0, volume: 0 }
  };

  const createdCount = safeInvoices.length;
  const sharedCount = safeInvoices.filter((invoice) => Boolean(invoice?.shared_at || invoice?.shared || invoice?.sent_at)).length;
  const viewedCount = safeInvoices.filter((invoice) => Boolean(invoice?.viewed_at || invoice?.viewed || invoice?.opened_at)).length;
  const paidCount = paidInvoices.length;

  const timeToPaySamples = [];

  paidInvoices.forEach((invoice) => {
    const amount = Number(invoice?.amount ?? invoice?.total ?? invoice?.paid_amount ?? 0);
    const assetName = toDisplayLabel(invoice?.asset_type || invoice?.asset || invoice?.asset_code || invoice?.currency || invoice?.symbol, 'Unknown');
    const networkName = toDisplayLabel(invoice?.network || invoice?.supporting_network || invoice?.network_path || invoice?.payment_network || invoice?.path || invoice?.channel, 'Unknown');
    const assetKind = classifyAsset(assetName);
    const networkKey = normalizeNetwork(networkName);
    const createdAt = parseTimestamp(invoice?.created_at || invoice?.createdAt || invoice?.created);
    const paidAt = parseTimestamp(invoice?.paid_at || invoice?.paidAt || invoice?.settled_at || invoice?.settledAt);

    if (createdAt && paidAt) {
      const diffHours = (paidAt.getTime() - createdAt.getTime()) / 36e5;
      if (Number.isFinite(diffHours) && diffHours >= 0) {
        timeToPaySamples.push(diffHours);
      }
    }

    if (assetKind === 'XLM') {
      xlmVsToken.xlm.count += 1;
      xlmVsToken.xlm.volume += Number.isFinite(amount) ? amount : 0;
    } else {
      xlmVsToken.token.count += 1;
      xlmVsToken.token.volume += Number.isFinite(amount) ? amount : 0;
    }

    const assetBucket = assetBuckets.get(assetName) || {
      asset: assetName,
      count: 0,
      volume: 0,
      networks: new Map()
    };
    assetBucket.count += 1;
    assetBucket.volume += Number.isFinite(amount) ? amount : 0;

    const networkBucket = assetBucket.networks.get(networkKey) || { network: networkName, count: 0, volume: 0 };
    networkBucket.count += 1;
    networkBucket.volume += Number.isFinite(amount) ? amount : 0;
    assetBucket.networks.set(networkKey, networkBucket);
    assetBuckets.set(assetName, assetBucket);

    const networkAggregate = networkBuckets.get(networkKey) || {
      network: networkName,
      count: 0,
      volume: 0,
      assets: new Map()
    };
    networkAggregate.count += 1;
    networkAggregate.volume += Number.isFinite(amount) ? amount : 0;

    const assetContribution = networkAggregate.assets.get(assetName) || { asset: assetName, count: 0, volume: 0 };
    assetContribution.count += 1;
    assetContribution.volume += Number.isFinite(amount) ? amount : 0;
    networkAggregate.assets.set(assetName, assetContribution);
    networkBuckets.set(networkKey, networkAggregate);
  });

  const assetBreakdown = Array.from(assetBuckets.values())
    .map((entry) => ({
      asset: entry.asset,
      count: entry.count,
      volume: entry.volume,
      networks: Array.from(entry.networks.values()).sort((left, right) => right.volume - left.volume)
    }))
    .sort((left, right) => right.volume - left.volume);

  const networkBreakdown = Array.from(networkBuckets.values())
    .map((entry) => ({
      network: entry.network,
      count: entry.count,
      volume: entry.volume,
      assets: Array.from(entry.assets.values()).sort((left, right) => right.volume - left.volume)
    }))
    .sort((left, right) => right.volume - left.volume);

  const xlmVolume = xlmVsToken.xlm.volume;
  const tokenVolume = xlmVsToken.token.volume;
  const dominant = xlmVolume >= tokenVolume ? 'XLM' : 'Tokens';
  const dominantDescription = xlmVolume === tokenVolume
    ? 'Usage is evenly split between XLM and token-based payments.'
    : dominant === 'XLM'
      ? 'XLM payments dominate usage.'
      : 'Token-based payments dominate usage.';

  const averageHours = timeToPaySamples.length > 0
    ? Number((timeToPaySamples.reduce((sum, value) => sum + value, 0) / timeToPaySamples.length).toFixed(2))
    : 0;

  return {
    totalPaidInvoices: paidInvoices.length,
    totalPaidVolume: paidInvoices.reduce((sum, invoice) => sum + Number(invoice?.amount ?? invoice?.total ?? invoice?.paid_amount ?? 0), 0),
    assetBreakdown,
    networkBreakdown,
    xlmVsToken: {
      ...xlmVsToken,
      dominant,
      dominantDescription
    },
    conversionMetrics: {
      createdCount,
      sharedCount,
      viewedCount,
      paidCount,
      funnel: [
        { stage: 'Created', count: createdCount, conversionRate: 100 },
        { stage: 'Shared', count: sharedCount, conversionRate: createdCount > 0 ? Number(((sharedCount / createdCount) * 100).toFixed(1)) : 0 },
        { stage: 'Viewed', count: viewedCount, conversionRate: createdCount > 0 ? Number(((viewedCount / createdCount) * 100).toFixed(1)) : 0 },
        { stage: 'Paid', count: paidCount, conversionRate: createdCount > 0 ? Number(((paidCount / createdCount) * 100).toFixed(1)) : 0 }
      ],
      timeToPay: {
        unit: 'hours',
        count: timeToPaySamples.length,
        averageHours,
        method: 'Difference between created_at and paid_at timestamps'
      }
    }
  };
}

module.exports = {
  buildAssetReport,
  classifyAsset,
  toDisplayLabel
};
