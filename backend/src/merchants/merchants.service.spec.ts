import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MerchantsService } from "./merchants.service";
import { PrismaService } from "../prisma/prisma.service";
import { StellarValidator } from "../stellar/utils/stellar.validator";

// ── Helpers ────────────────────────────────────────────────────────────────

function merchantFixture(
  overrides: Partial<{
    id: string;
    name: string;
    stellarPublicKey: string;
    businessEmail: string | null;
    nameConfiguredAt: Date | null;
    assetConfiguredAt: Date | null;
    payoutWallet: string | null;
    preferredAsset: string;
    webhookUrl: string | null;
    invoices: unknown[];
  }> = {},
) {
  return {
    id: "merchant-test",
    name: "Merchant GABC12", // auto-generated placeholder
    stellarPublicKey:
      "GABC123456789012345678901234567890123456789012345678901234",
    businessEmail: "billing@acme.test",
    nameConfiguredAt: null,
    assetConfiguredAt: null,
    payoutWallet: null,
    preferredAsset: "XLM",
    webhookUrl: null,
    invoices: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function checklistFixture(
  overrides: Partial<{
    id: string;
    merchantId: string;
    profileCompleted: boolean;
    payoutKeyCompleted: boolean;
    assetPreferenceCompleted: boolean;
    firstInvoiceCompleted: boolean;
    isCompleted: boolean;
    completedAt: Date | null;
  }> = {},
) {
  return {
    id: "checklist-1",
    merchantId: "merchant-test",
    profileCompleted: false,
    payoutKeyCompleted: false,
    assetPreferenceCompleted: false,
    firstInvoiceCompleted: false,
    isCompleted: false,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildPrismaMock(
  merchantData: ReturnType<typeof merchantFixture>,
  checklistData?: ReturnType<typeof checklistFixture>,
) {
  const db = {
    merchant: { ...merchantData },
    checklist: checklistData
      ? { ...checklistData }
      : (null as ReturnType<typeof checklistFixture> | null),
  };

  const prisma = {
    merchant: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string } }) => {
        if (where.id !== db.merchant.id) return null;
        return db.merchant;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id?: string } }) => {
        if (where.id !== db.merchant.id) throw new NotFoundException("Merchant not found");
        return db.merchant;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          if (where.id !== db.merchant.id) throw new Error("Not found");
          Object.assign(db.merchant, data);
          return db.merchant;
        },
      ),
    },
    merchantActivationChecklist: {
      findUnique: jest.fn(
        async ({ where }: { where: { merchantId: string } }) => {
          if (!db.checklist || db.checklist.merchantId !== where.merchantId) {
            return null;
          }
          return db.checklist;
        },
      ),
      create: jest.fn(async ({ data }: { data: { merchantId: string } }) => {
        db.checklist = checklistFixture({ merchantId: data.merchantId });
        return db.checklist;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { merchantId: string };
          data: Record<string, unknown>;
        }) => {
          if (!db.checklist || db.checklist.merchantId !== where.merchantId) {
            throw new Error("Checklist not found");
          }
          Object.assign(db.checklist, data);
          return db.checklist;
        },
      ),
    },
    _db: db,
  } as unknown as PrismaService & { _db: typeof db };

  return prisma;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("MerchantsService", () => {
  describe("Profile & Settings CRUD", () => {
    const merchantId = "merchant-1";
    const payoutWallet = StellarValidator.generateKeypair().publicKey;

    const merchant = merchantFixture({
      id: merchantId,
      name: "Acme Studio",
      payoutWallet,
    });

    const prisma = {
      merchant: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };

    let service: MerchantsService;

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.merchant.findUnique.mockResolvedValue(merchant);
      prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
      prisma.merchant.update.mockResolvedValue(merchant);
      service = new MerchantsService(prisma as unknown as PrismaService);
    });

    it("returns the merchant profile via findProfile", async () => {
      const res = await service.findProfile(merchantId);
      expect(res).toMatchObject({ id: merchantId, name: "Acme Studio" });
      expect(prisma.merchant.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: merchantId },
      });
    });

    it("returns the merchant profile via getProfile", async () => {
      const res = await service.getProfile(merchantId);
      expect(res).toMatchObject({ id: merchantId, name: "Acme Studio" });
      expect(prisma.merchant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: merchantId } }),
      );
    });

    it("creates or replaces profile setup data via upsertProfile", async () => {
      await service.upsertProfile(merchantId, {
        name: "Acme Studio",
        businessEmail: "billing@acme.test",
        preferredAsset: "usdc",
        payoutWallet,
      });

      expect(prisma.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: merchantId },
          data: expect.objectContaining({
            name: "Acme Studio",
            businessEmail: "billing@acme.test",
            preferredAsset: "USDC",
            payoutWallet,
          }),
        }),
      );
    });

    it("updates partial profile setup data via updateProfile", async () => {
      await service.updateProfile(merchantId, {
        preferredAsset: "XLM",
        payoutWallet,
      });

      expect(prisma.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: merchantId },
          data: expect.objectContaining({
            preferredAsset: "XLM",
            payoutWallet,
          }),
        }),
      );
    });

    it("rejects invalid Stellar payout wallets before saving in updateProfile", async () => {
      await expect(
        service.updateProfile(merchantId, {
          payoutWallet: "not-a-stellar-key",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.merchant.update).not.toHaveBeenCalled();
    });
  });

  describe("syncChecklist — completion rules", () => {
    it("leaves all checklist steps incomplete when the merchant has only default values", async () => {
      const merchant = merchantFixture();
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantsService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(false);
      expect(result.assetPreferenceCompleted).toBe(false);
      expect(result.payoutKeyCompleted).toBe(false);
      expect(result.firstInvoiceCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
    });

    it("does not write to the DB when nothing changed", async () => {
      const merchant = merchantFixture();
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantsService(prisma);

      await service.syncChecklist("merchant-test");

      expect(prisma.merchantActivationChecklist.update).not.toHaveBeenCalled();
    });

    it("creates the checklist if it does not exist yet", async () => {
      const merchant = merchantFixture();
      const prisma = buildPrismaMock(merchant);
      const service = new MerchantsService(prisma);

      await service.syncChecklist("merchant-test");

      expect(prisma.merchantActivationChecklist.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { merchantId: "merchant-test" } }),
      );
    });
  });

  describe("default-only state — defaults never auto-complete", () => {
    it("a non-empty name string alone does NOT complete profileCompleted without timestamp", async () => {
      const merchant = merchantFixture({
        name: "Merchant GABC12",
        nameConfiguredAt: null,
      });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantsService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(false);
    });

    it("the default 'XLM' preferredAsset alone does NOT complete assetPreferenceCompleted", async () => {
      const merchant = merchantFixture({
        preferredAsset: "XLM",
        assetConfiguredAt: null,
      });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantsService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.assetPreferenceCompleted).toBe(false);
    });
  });

  describe("partially & fully configured merchant", () => {
    it("completes profileCompleted when nameConfiguredAt is set", async () => {
      const now = new Date();
      const merchant = merchantFixture({ nameConfiguredAt: now });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantsService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(true);
      expect(result.isCompleted).toBe(false);
    });

    it("completes all steps and marks isCompleted when everything is set", async () => {
      const now = new Date();
      const merchant = merchantFixture({
        nameConfiguredAt: now,
        assetConfiguredAt: now,
        preferredAsset: "USDC",
        payoutWallet:
          "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
        invoices: [{ id: "inv-1" }],
      });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantsService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(true);
      expect(result.assetPreferenceCompleted).toBe(true);
      expect(result.payoutKeyCompleted).toBe(true);
      expect(result.firstInvoiceCompleted).toBe(true);
      expect(result.isCompleted).toBe(true);
      expect(result.completedAt).not.toBeNull();
    });
  });

  describe("updateSettings — configuration timestamp stamping", () => {
    it("stamps nameConfiguredAt when name is updated", async () => {
      const merchant = merchantFixture();
      const prisma = buildPrismaMock(merchant);
      const service = new MerchantsService(prisma);

      await service.updateSettings("merchant-test", { name: "My Real Business" });

      const updateCall = (prisma.merchant.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.name).toBe("My Real Business");
      expect(updateCall.data.nameConfiguredAt).toBeInstanceOf(Date);
    });

    it("stamps assetConfiguredAt when preferredAsset is updated", async () => {
      const merchant = merchantFixture();
      const prisma = buildPrismaMock(merchant);
      const service = new MerchantsService(prisma);

      await service.updateSettings("merchant-test", { preferredAsset: "USDC" });

      const updateCall = (prisma.merchant.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.preferredAsset).toBe("USDC");
      expect(updateCall.data.assetConfiguredAt).toBeInstanceOf(Date);
    });

    it("throws BadRequestException for invalid Stellar payout key", async () => {
      const merchant = merchantFixture();
      const prisma = buildPrismaMock(merchant);
      const service = new MerchantsService(prisma);

      await expect(
        service.updateSettings("merchant-test", {
          payoutPublicKey: "NOT_A_STELLAR_KEY",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
