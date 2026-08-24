import { PrismaClient, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function generateMemoId(): string {
  return `invoisio-${crypto.randomUUID()}`;
}

async function main() {
  const merchantPublicKey =
    process.env.MERCHANT_PUBLIC_KEY ||
    'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const defaultMerchantId = '00000000-0000-0000-0000-000000000000';

  console.log('Seeding sample data for Invoisio...');

  // Ensure default merchant exists
  await prisma.merchant.upsert({
    where: { id: defaultMerchantId },
    update: {},
    create: {
      id: defaultMerchantId,
      name: 'Acme Demo Merchant',
      stellarPublicKey: merchantPublicKey,
      preferredAsset: 'USDC',
    },
  });

  const existingInvoices = await prisma.invoice.count({
    where: { merchantId: defaultMerchantId },
  });

  if (existingInvoices > 0) {
    console.log(`Found ${existingInvoices} existing sample invoices, skipping invoice seed.`);
    return;
  }

  await prisma.invoice.createMany({
    data: [
      {
        merchantId: defaultMerchantId,
        invoiceNumber: 'INV-001',
        clientName: 'Acme Corporation',
        clientEmail: 'billing@acme.com',
        description: 'Web development services - March 2026',
        amount: 1500.0 as any,
        amountPaid: 0 as any,
        amountDue: 1500.0 as any,
        assetCode: 'USDC',
        assetIssuer:
          'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        memo: generateMemoId(),
        memoType: 'ID',
        status: 'pending',
        destinationAddress: merchantPublicKey,
        txHash: null,
        sorobanTxHash: null,
        sorobanContractId: null,
        metadata: Prisma.JsonNull,
        dueDate: new Date('2026-03-31T23:59:59Z'),
      },
      {
        merchantId: defaultMerchantId,
        invoiceNumber: 'INV-002',
        clientName: 'TechStart Inc',
        clientEmail: 'payments@techstart.io',
        description: 'Consulting services - Q1 2026',
        amount: 5000.0 as any,
        amountPaid: 5000.0 as any,
        amountDue: 0 as any,
        assetCode: 'XLM',
        assetIssuer: null,
        memo: generateMemoId(),
        memoType: 'ID',
        status: 'paid',
        destinationAddress: merchantPublicKey,
        txHash: null,
        sorobanTxHash: null,
        sorobanContractId: null,
        metadata: Prisma.JsonNull,
        dueDate: new Date('2026-03-15T23:59:59Z'),
      },
      {
        merchantId: defaultMerchantId,
        invoiceNumber: 'INV-003',
        clientName: 'Global Solutions Ltd',
        clientEmail: 'accounts@globalsolutions.com',
        description: 'API integration project',
        amount: 3200.5 as any,
        amountPaid: 0 as any,
        amountDue: 3200.5 as any,
        assetCode: 'USDC',
        assetIssuer:
          'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        memo: generateMemoId(),
        memoType: 'ID',
        status: 'overdue',
        destinationAddress: merchantPublicKey,
        txHash: null,
        sorobanTxHash: null,
        sorobanContractId: null,
        metadata: Prisma.JsonNull,
        dueDate: new Date('2026-02-10T23:59:59Z'),
      },
    ],
  });

  console.log('Sample data successfully seeded.');
}

main()
  .catch((e) => {
    console.error('Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
