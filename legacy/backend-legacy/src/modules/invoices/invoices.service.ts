import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateInvoiceDto) {
    const { items, ...rest } = dto;

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const tax = (Number(dto.taxRate || 0) / 100) * subtotal;
    const total = subtotal + tax;

    return this.prisma.invoice.create({
      data: {
        ...rest,
        userId,
        items: JSON.stringify(items),
        subtotal,
        tax,
        total,
      },
    });
  }

  async findAllByUser(userId: string) {
    return this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
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

  async findOne(id: string, userId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      include: { payments: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(id: string, userId: string, dto: UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, userId },
      // ✅ Explicitly include taxRate so we can use it
      select: {
        id: true,
        subtotal: true,
        tax: true,
        total: true,
        taxRate: true,
        items: true,
      },
    });
  
    if (!existing) throw new NotFoundException('Invoice not found');
  
    const { items, taxRate } = dto;
  
    // Convert decimals properly
    let subtotal = new Prisma.Decimal(existing.subtotal);
    let tax = new Prisma.Decimal(existing.tax);
    let total = new Prisma.Decimal(existing.total);
    let rate = new Prisma.Decimal(taxRate ?? existing.taxRate ?? 0);
  
    if (items && items.length > 0) {
      subtotal = new Prisma.Decimal(items.reduce((sum, item) => sum + item.amount, 0));
      tax = subtotal.mul(rate).div(100);
      total = subtotal.add(tax);
    }
  
    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...dto,
        items: (items ?? existing.items ?? Prisma.DbNull) as Prisma.InputJsonValue,
        subtotal,
        tax,
        total,
        taxRate: rate,
        updatedAt: new Date(),
      },
    });
  }

  async remove(id: string, userId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    return this.prisma.invoice.delete({ where: { id } });
  }
}