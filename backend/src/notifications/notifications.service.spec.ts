import { ConfigService } from "@nestjs/config";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { MailProvider } from "./mail-provider.interface";

describe("NotificationsService", () => {
  it("sends a branded payment request email through the configured mail provider", async () => {
    const mailProvider: MailProvider = {
      send: jest.fn().mockResolvedValue({
        messageId: "mail-1",
        accepted: ["client@example.com"],
        rejected: [],
      }),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === "APP_BASE_URL") return "https://app.invoisio.test";
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new NotificationsService(
      {} as PrismaService,
      configService,
      mailProvider,
    );

    await service.sendPaymentRequestEmail({
      id: "invoice-1",
      merchantId: "merchant-1",
      userId: "user-1",
      invoiceNumber: "INV-001",
      clientName: "Acme Corp",
      clientEmail: "client@example.com",
      description: "Consulting services",
      amount: { toString: () => "250.00" },
      amountPaid: { toString: () => "0" },
      amountDue: { toString: () => "250.00" },
      assetCode: "USDC",
      assetIssuer: null,
      memo: "123456",
      memoType: "ID",
      status: "pending",
      destinationAddress:
        "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      txHash: null,
      sorobanTxHash: null,
      sorobanContractId: null,
      metadata: null,
      dueDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    expect(mailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        subject: "Payment request for invoice INV-001",
        html: expect.stringContaining(
          "https://app.invoisio.test/invoices/invoice-1",
        ),
        text: expect.stringContaining("Amount: 250.00 USDC"),
      }),
    );
  });
});
