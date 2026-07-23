import { BadRequestException } from "@nestjs/common";
import { MerchantsService } from "./merchants.service";
import { PrismaService } from "../prisma/prisma.service";
import { StellarValidator } from "../stellar/utils/stellar.validator";

describe("MerchantsService", () => {
  const merchantId = "merchant-1";
  const payoutWallet = StellarValidator.generateKeypair().publicKey;

  const merchant = {
    id: merchantId,
    name: "Acme Studio",
    stellarPublicKey: StellarValidator.generateKeypair().publicKey,
    businessEmail: "billing@acme.test",
    preferredAsset: "USDC",
    payoutWallet,
    webhookUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const prisma = {
    merchant: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: MerchantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.merchant.update.mockResolvedValue(merchant);
    service = new MerchantsService(prisma as unknown as PrismaService);
  });

  it("returns the merchant profile", async () => {
    await expect(service.findProfile(merchantId)).resolves.toEqual(merchant);
    expect(prisma.merchant.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: merchantId },
    });
  });

  it("creates or replaces profile setup data", async () => {
    await service.upsertProfile(merchantId, {
      name: "Acme Studio",
      businessEmail: "billing@acme.test",
      preferredAsset: "usdc",
      payoutWallet,
    });

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: merchantId },
      data: {
        name: "Acme Studio",
        businessEmail: "billing@acme.test",
        preferredAsset: "USDC",
        payoutWallet,
      },
    });
  });

  it("updates partial profile setup data", async () => {
    await service.updateProfile(merchantId, {
      preferredAsset: "XLM",
      payoutWallet,
    });

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: merchantId },
      data: {
        preferredAsset: "XLM",
        payoutWallet,
      },
    });
  });

  it("rejects invalid Stellar payout wallets before saving", async () => {
    await expect(
      service.updateProfile(merchantId, {
        payoutWallet: "not-a-stellar-key",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.merchant.update).not.toHaveBeenCalled();
  });
});
