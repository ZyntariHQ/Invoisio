const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildAssetReport } = require('./asset-reporting');

const port = process.env.PORT || 3000;

const sampleInvoices = [
  { id: 'inv-1', status: 'paid', amount: 120, asset_type: 'XLM', network: 'stellar' },
  { id: 'inv-2', status: 'paid', amount: 85, asset_type: 'USDC', network: 'stellar' },
  { id: 'inv-3', status: 'paid', amount: 96, asset_type: 'USDT', network: 'ethereum' },
  { id: 'inv-4', status: 'paid', amount: 44, asset_type: '', network: '' },
  { id: 'inv-5', status: 'paid', amount: 60, asset_type: 'XLM', network: 'stellar' },
  { id: 'inv-6', status: 'paid', amount: 27, asset_type: 'USDC', network: 'solana' }
];

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/asset-report') {
    sendJson(res, buildAssetReport(sampleInvoices));
    return;
  }

  if (url.pathname.startsWith('/api/asset-report/')) {
    const merchantId = decodeURIComponent(url.pathname.split('/').pop());
    const merchantInvoices = sampleInvoices.filter((invoice) => invoice.id === merchantId || invoice.merchantId === merchantId);
    sendJson(res, buildAssetReport(merchantInvoices));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    sendFile(res, path.join(__dirname, '..', 'app', 'index.html'), 'text/html; charset=utf-8');
    return;
  }

  if (url.pathname === '/styles.css') {
    sendFile(res, path.join(__dirname, '..', 'app', 'styles.css'), 'text/css; charset=utf-8');
    return;
  }

  if (url.pathname === '/app.js') {
    sendFile(res, path.join(__dirname, '..', 'app', 'app.js'), 'application/javascript; charset=utf-8');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`Asset reporting app listening on http://localhost:${port}`);
});
