import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createInvoiceDto: CreateInvoiceDto) {
    // Calculate totals
    let subtotal = 0;
    const items = createInvoiceDto.items.map(item => {
      const itemTotal = item.quantity * item.unitPrice;
      subtotal += itemTotal;
      return {
        ...item,
        total: itemTotal,
      };
    });

    const tax = createInvoiceDto.items.reduce((acc, item) => {
      if (item.taxRate) {
        return acc + (item.quantity * item.unitPrice * item.taxRate) / 100;
      }
      return acc;
    }, 0);

    const total = subtotal + tax;

    // Generate unique invoice number
    const invoiceNumber = `INV-${Date.now()}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        userId,
        invoiceNumber,
        clientName: createInvoiceDto.clientName,
        clientEmail: createInvoiceDto.clientEmail,
        currency: createInvoiceDto.currency,
        status: 'draft',
        items: JSON.stringify(items),
        subtotal: subtotal.toString(),
        tax: tax.toString(),
        total: total.toString(),
      },
    });

    return {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        subtotal: parseFloat(invoice.subtotal.toString()),
        tax: parseFloat(invoice.tax.toString()),
        total: parseFloat(invoice.total.toString()),
        status: invoice.status,
      },
    };
  }

  async findAll(userId: string, page: number = 1, limit: number = 10, status?: string, search?: string) {
    const where: any = { userId };
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: 'insensitive' } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      invoices: invoices.map(invoice => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        total: parseFloat(invoice.total.toString()),
        status: invoice.status,
        createdAt: invoice.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  async findOne(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    return {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        items: JSON.parse(invoice.items as string),
        subtotal: parseFloat(invoice.subtotal.toString()),
        tax: parseFloat(invoice.tax.toString()),
        total: parseFloat(invoice.total.toString()),
        status: invoice.status,
      },
    };
  }

  async update(userId: string, id: string, updateInvoiceDto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const updatedInvoice = await this.prisma.invoice.update({
      where: { id },
      data: {
        clientName: updateInvoiceDto.clientName,
        clientEmail: updateInvoiceDto.clientEmail,
        currency: updateInvoiceDto.currency,
        status: updateInvoiceDto.status,
      },
    });

    return {
      invoice: {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        clientName: updatedInvoice.clientName,
        items: JSON.parse(updatedInvoice.items as string),
        subtotal: parseFloat(updatedInvoice.subtotal.toString()),
        tax: parseFloat(updatedInvoice.tax.toString()),
        total: parseFloat(updatedInvoice.total.toString()),
        status: updatedInvoice.status,
      },
    };
  }

  async remove(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    await this.prisma.invoice.delete({
      where: { id },
    });

    return { success: true };
  }
}