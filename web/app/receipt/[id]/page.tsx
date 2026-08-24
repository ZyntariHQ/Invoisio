import type { Metadata } from 'next';
import ReceiptPage from './client-page';
import { PublicInvoiceService } from '@/lib/public-invoice-service';
import { createInvoiceMetadata } from '@/lib/public-invoice-metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return createInvoiceMetadata(await PublicInvoiceService.getInvoiceForPage(id), 'receipt');
}

export default async function ReceiptRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await PublicInvoiceService.getInvoiceForPage(id);
  return <ReceiptPage invoiceId={id} initialInvoice={invoice} />;
}