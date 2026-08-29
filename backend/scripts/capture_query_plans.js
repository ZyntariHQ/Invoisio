#!/usr/bin/env node
/*
  Capture EXPLAIN ANALYZE plans for hot queries. Set DATABASE_URL and optionally MERCHANT_ID and USER_ID.
  Outputs plans to stdout.

  Example:
    DATABASE_URL=... node backend/scripts/capture_query_plans.js
*/
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const merchantId = process.env.MERCHANT_ID || '00000000-0000-0000-0000-000000000000';
const userId = process.env.USER_ID || '00000000-0000-0000-0000-000000000000';

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const now = new Date().toISOString();

  const queries = [
    {
      name: 'webhook_queue_poll',
      sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id, invoice_id, user_id, url, payload, status, attempts, last_attempt_at, next_attempt_at, created_at FROM webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY created_at ASC LIMIT 50;`
    },
    {
      name: 'overdue_invoices_sweep',
      sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id FROM invoices WHERE status = 'pending' AND due_date < now();`
    },
    {
      name: 'merchant_invoice_list',
      sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT * FROM invoices WHERE merchant_id = '${merchantId}' AND status = 'pending' ORDER BY created_at DESC LIMIT 50;`
    }
  ];

  for (const q of queries) {
    console.log('\n--- Plan for', q.name, '---');
    const res = await client.query(q.sql);
    console.log(res.rows.map(r => r[Object.keys(r)[0]]).join('\n'));
  }

  await client.end();
}

run().catch(err => { console.error(err); process.exit(2); });
