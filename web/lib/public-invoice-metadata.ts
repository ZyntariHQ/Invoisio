import type { Metadata } from 'next';
import type { PublicInvoice } from './public-invoice-service';

const fallbackDescription = 'View a secure Stellar invoice payment page from Invoisio.';

function invoiceLabel(invoice: PublicInvoice): string {
  return invoice.invoiceNumber || `Invoice ${invoice.id.slice(0, 8)}`;
}

function amountLabel(invoice: PublicInvoice): string {
  return `${Number(invoice.amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  })} ${invoice.asset_code || 'XLM'}`;
}

export function createInvoiceMetadata(
  invoice: PublicInvoice | null,
  kind: 'pay' | 'receipt',
): Metadata {
  if (!invoice) {
    return {
      title: kind === 'receipt' ? 'Payment Receipt | Invoisio' : 'Pay Invoice | Invoisio',
      description: fallbackDescription,
      openGraph: {
        title: kind === 'receipt' ? 'Payment Receipt | Invoisio' : 'Pay Invoice | Invoisio',
        description: fallbackDescription,
        type: 'website',
        images: ['/invoice-preview.svg'],
      },
      twitter: { card: 'summary', title: 'Invoisio', description: fallbackDescription, images: ['/invoice-preview.svg'] },
    };
  }

  const state = invoice.status === 'paid' ? 'Paid' : 'Payment requested';
  const title = kind === 'receipt'
    ? `${state} receipt: ${invoiceLabel(invoice)} | Invoisio`
    : `${state}: ${invoiceLabel(invoice)} | Invoisio`;
  const description = kind === 'receipt'
    ? `${state} receipt for ${amountLabel(invoice)} from ${invoice.merchantName}.`
    : `${amountLabel(invoice)} requested by ${invoice.merchantName} for ${invoiceLabel(invoice)}.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website', images: ['/invoice-preview.svg'] },
    twitter: { card: 'summary', title, description, images: ['/invoice-preview.svg'] },
  };
}