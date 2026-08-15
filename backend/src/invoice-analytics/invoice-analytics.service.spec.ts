import { InvoiceAnalyticsService } from "./invoice-analytics.service";
import { PrismaService } from "../prisma/prisma.service";
import { CaptureEngagementEventDto } from "./dto/capture-engagement-event.dto";
import { InvoiceEngagementEventType } from "@prisma/client";

describe("InvoiceAnalyticsService", () => {
  let service: InvoiceAnalyticsService;
  let mockPrisma: Partial<Record<string, any>>;

  beforeEach(() => {
    mockPrisma = {
      invoice: {
        findFirst: jest.fn(),
      },
      invoiceEngagementEvent: {
        create: jest.fn(),
      },
    };
    service = new InvoiceAnalyticsService(mockPrisma as unknown as PrismaService);
  });

  it("captures an impression event", async () => {
    (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue({ id: "inv-1", merchantId: "m-1" });
    (mockPrisma.invoiceEngagementEvent.create as jest.Mock).mockResolvedValue({ id: "evt-1", eventType: InvoiceEngagementEventType.impression, createdAt: new Date() });

    const dto: CaptureEngagementEventDto = {
      invoiceId: "inv-1",
      eventType: InvoiceEngagementEventType.impression,
      anonymizedVisitorId: "visitor_123",
    } as any;

    const res = await service.captureEvent(dto);
    expect(res).toBeDefined();
    expect(res.id).toBe("evt-1");
    expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith({ where: { id: "inv-1" }, select: { id: true, merchantId: true } });
    expect(mockPrisma.invoiceEngagementEvent.create).toHaveBeenCalled();
  });

  it("captures a copy action and records funnel step", async () => {
    (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue({ id: "inv-2", merchantId: "m-2" });
    (mockPrisma.invoiceEngagementEvent.create as jest.Mock).mockResolvedValue({ id: "evt-2", eventType: InvoiceEngagementEventType.copy_destination, createdAt: new Date() });

    const dto: CaptureEngagementEventDto = {
      invoiceId: "inv-2",
      eventType: InvoiceEngagementEventType.copy_destination,
      anonymizedVisitorId: "visitor_456",
      referrer: "https://example.com",
      userAgent: "Mozilla/5.0",
    } as any;

    const res = await service.captureEvent(dto);
    expect(res.id).toBe("evt-2");
    expect(mockPrisma.invoiceEngagementEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: InvoiceEngagementEventType.copy_destination }) , select: { id: true, eventType: true, createdAt: true } } ));
  });

  it("throws NotFoundException for unknown invoice", async () => {
    (mockPrisma.invoice.findFirst as jest.Mock).mockResolvedValue(null);
    const dto: CaptureEngagementEventDto = {
      invoiceId: "unknown",
      eventType: InvoiceEngagementEventType.impression,
      anonymizedVisitorId: "v",
    } as any;
    await expect(service.captureEvent(dto)).rejects.toThrow();
  });
});
