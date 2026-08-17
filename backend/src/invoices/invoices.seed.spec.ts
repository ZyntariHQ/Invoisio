import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { SorobanService } from '../soroban/soroban.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StructuredLogger } from '../observability/structured-logger.service';
import { InvoiceEventsService } from '../realtime/invoice-events.service';
import { ActivityFeedService } from '../activity-feed/activity-feed.service';
import { mockStructuredLogger } from '../observability/testing/observability.mock';

describe('InvoicesService - Seeding Behavior', () => {
  let service: InvoicesService;

  const mockPrisma = {
    invoice: {
      count: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const mockStellar = {
    getMerchantPublicKey: jest.fn().mockReturnValue('GB1234567890'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: mockStellar },
        { provide: SorobanService, useValue: { hasInvoicePayment: jest.fn() } },
        { provide: WebhooksService, useValue: { queueInvoiceEvent: jest.fn() } },
        { provide: NotificationsService, useValue: { notifyPaymentReceived: jest.fn() } },
        { provide: StructuredLogger, useValue: mockStructuredLogger },
        { provide: InvoiceEventsService, useValue: { publishStatusChange: jest.fn() } },
        { provide: ActivityFeedService, useValue: { recordActivity: jest.fn() } },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it('should not seed on startup by default outside development SEED_SAMPLE_DATA flag', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SEED_SAMPLE_DATA;

    await service.onModuleInit();
    expect(mockPrisma.invoice.count).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.createMany).not.toHaveBeenCalled();
  });

  it('should seed when NODE_ENV is development and SEED_SAMPLE_DATA is true', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SEED_SAMPLE_DATA = 'true';
    mockPrisma.invoice.count.mockResolvedValue(0);

    await service.onModuleInit();
    expect(mockPrisma.invoice.count).toHaveBeenCalled();
    expect(mockPrisma.invoice.createMany).toHaveBeenCalled();
  });
});
