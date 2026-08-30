import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicPayerPage from './client-page';
import { PublicInvoiceService } from '@/lib/public-invoice-service';
import { createInvoiceMetadata } from '@/lib/public-invoice-metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return createInvoiceMetadata(await PublicInvoiceService.getInvoiceForPage(id), 'pay');
}

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await PublicInvoiceService.getInvoiceForPage(id);
  if (!invoice) {
    notFound();
  }
  return <PublicPayerPage invoiceId={id} initialInvoice={invoice} />;
}