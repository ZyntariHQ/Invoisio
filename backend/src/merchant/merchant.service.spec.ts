/**
 * merchant.service.spec.ts
 *
 * Unit tests for MerchantService.syncChecklist and updateSettings.
 *
 * Focus: verifying that default/auto-generated values do NOT inflate the
 * onboarding checklist, while intentionally configured values DO complete
 * the corresponding steps.
 *
 * Three merchant states are exercised:
 *   1. Empty / fresh-signup   — only placeholder defaults, no real data
 *   2. Default-only           — still only defaults (same as fresh; confirms
 *                               the "XLM" asset default and placeholder name
 *                               never auto-complete steps)
 *   3. Fully configured       — all four steps meaningfully completed
 *
 * Additional cases cover partial configuration and updateSettings stamp
 * behaviour for nameConfiguredAt / assetConfiguredAt.
 */

import { NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantService } from "./merchant.service";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a minimal Merchant record as Prisma would return it.
 * All optional/nullable fields default to the "nothing configured" state
 * so individual tests only need to override what they care about.
 */
function merchantFixture(
  overrides: Partial<{
    id: string;
    name: string;
    stellarPublicKey: string;
    nameConfiguredAt: Date | null;
    assetConfiguredAt: Date | null;
    payoutWallet: string | null;
    preferredAsset: string;
    invoices: unknown[];
  }> = {},
) {
  return {
    id: "merchant-test",
    name: "Merchant GABC12", // auto-generated placeholder
    stellarPublicKey:
      "GABC123456789012345678901234567890123456789012345678901234",
    nameConfiguredAt: null, // NOT configured yet
    assetConfiguredAt: null, // NOT configured yet
    payoutWallet: null,
    preferredAsset: "XLM", // schema default
    invoices: [],
    ...overrides,
  };
}

/**
 * Build a minimal MerchantActivationChecklist record.
 */
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

// ── Mock factory ───────────────────────────────────────────────────────────

/**
 * Creates a Prisma mock preconfigured for a given merchant state.
 * Stores the "database" in plain objects so tests can assert on them.
 */
function buildPrismaMock(
  merchantData: ReturnType<typeof merchantFixture>,
  checklistData?: ReturnType<typeof checklistFixture>,
) {
  // Simulate DB with a mutable reference
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
    _db: db, // expose for assertions
  } as unknown as PrismaService & { _db: typeof db };

  return prisma;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("MerchantService.syncChecklist — checklist completion rules", () => {
  describe("fresh merchant (empty / default-only state)", () => {
    it("leaves all checklist steps incomplete when the merchant has only default values", async () => {
      const merchant = merchantFixture(); // all defaults, no intentional config
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

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
      const service = new MerchantService(prisma);

      await service.syncChecklist("merchant-test");

      // updateChecklist → merchantActivationChecklist.update should NOT be called
      expect(prisma.merchantActivationChecklist.update).not.toHaveBeenCalled();
    });

    it("creates the checklist if it does not exist yet (first sync for a new merchant)", async () => {
      const merchant = merchantFixture();
      // No checklist in DB yet
      const prisma = buildPrismaMock(merchant);
      const service = new MerchantService(prisma);

      await service.syncChecklist("merchant-test");

      expect(prisma.merchantActivationChecklist.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { merchantId: "merchant-test" } }),
      );
    });
  });

  describe("default-only state — explicit verification that defaults never auto-complete", () => {
    it("a non-empty name string alone does NOT complete profileCompleted", async () => {
      // Old (buggy) logic: `name.length > 0` was truthy — caught by this test
      const merchant = merchantFixture({
        name: "Merchant GABC12", // placeholder, nameConfiguredAt is still null
        nameConfiguredAt: null,
      });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(false);
    });

    it("the default 'XLM' preferredAsset alone does NOT complete assetPreferenceCompleted", async () => {
      // Old (buggy) logic: `preferredAsset` was truthy → auto-completed
      const merchant = merchantFixture({
        preferredAsset: "XLM", // schema default, assetConfiguredAt is still null
        assetConfiguredAt: null,
      });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.assetPreferenceCompleted).toBe(false);
    });

    it("any non-null preferredAsset alone does NOT complete assetPreferenceCompleted without assetConfiguredAt", async () => {
      // Even if somehow a non-XLM asset ended up in the DB without going through
      // updateSettings (e.g. a data migration), no timestamp → not completed.
      const merchant = merchantFixture({
        preferredAsset: "USDC",
        assetConfiguredAt: null, // no explicit save
      });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.assetPreferenceCompleted).toBe(false);
    });
  });

  describe("partially configured merchant", () => {
    it("completes only profileCompleted when nameConfiguredAt is set", async () => {
      const now = new Date();
      const merchant = merchantFixture({ nameConfiguredAt: now });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(true);
      expect(result.assetPreferenceCompleted).toBe(false);
      expect(result.payoutKeyCompleted).toBe(false);
      expect(result.firstInvoiceCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
    });

    it("completes only assetPreferenceCompleted when assetConfiguredAt is set", async () => {
      const now = new Date();
      const merchant = merchantFixture({
        assetConfiguredAt: now,
        preferredAsset: "USDC",
      });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(false);
      expect(result.assetPreferenceCompleted).toBe(true);
      expect(result.payoutKeyCompleted).toBe(false);
    });

    it("completes only payoutKeyCompleted when payoutWallet is set", async () => {
      const merchant = merchantFixture({
        payoutWallet:
          "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
      });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.payoutKeyCompleted).toBe(true);
      expect(result.profileCompleted).toBe(false);
      expect(result.assetPreferenceCompleted).toBe(false);
    });

    it("completes only firstInvoiceCompleted when at least one invoice exists", async () => {
      const merchant = merchantFixture({ invoices: [{ id: "inv-1" }] });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.firstInvoiceCompleted).toBe(true);
      expect(result.profileCompleted).toBe(false);
      expect(result.assetPreferenceCompleted).toBe(false);
      expect(result.payoutKeyCompleted).toBe(false);
    });
  });

  describe("fully configured merchant", () => {
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
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(true);
      expect(result.assetPreferenceCompleted).toBe(true);
      expect(result.payoutKeyCompleted).toBe(true);
      expect(result.firstInvoiceCompleted).toBe(true);
      expect(result.isCompleted).toBe(true);
      expect(result.completedAt).not.toBeNull();
    });
  });

  describe("error handling", () => {
    it("throws NotFoundException when merchant does not exist", async () => {
      const merchant = merchantFixture({ id: "different-id" });
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      await expect(
        service.syncChecklist("nonexistent-id"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

// ── updateSettings stamp tests ─────────────────────────────────────────────

describe("MerchantService.updateSettings — configuration timestamp stamping", () => {
  it("stamps nameConfiguredAt when name is updated", async () => {
    const merchant = merchantFixture();
    const prisma = buildPrismaMock(merchant);
    const service = new MerchantService(prisma);

    await service.updateSettings("merchant-test", { name: "My Real Business" });

    const updateCall = (prisma.merchant.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.name).toBe("My Real Business");
    expect(updateCall.data.nameConfiguredAt).toBeInstanceOf(Date);
  });

  it("stamps assetConfiguredAt when preferredAsset is updated", async () => {
    const merchant = merchantFixture();
    const prisma = buildPrismaMock(merchant);
    const service = new MerchantService(prisma);

    await service.updateSettings("merchant-test", { preferredAsset: "USDC" });

    const updateCall = (prisma.merchant.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.preferredAsset).toBe("USDC");
    expect(updateCall.data.assetConfiguredAt).toBeInstanceOf(Date);
  });

  it("does NOT stamp nameConfiguredAt when name is not in the DTO", async () => {
    const merchant = merchantFixture();
    const prisma = buildPrismaMock(merchant);
    const service = new MerchantService(prisma);

    // Only updating webhookUrl — name is untouched
    await service.updateSettings("merchant-test", {
      webhookUrl: "https://example.com/wh",
    });

    const updateCall = (prisma.merchant.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.nameConfiguredAt).toBeUndefined();
  });

  it("does NOT stamp assetConfiguredAt when preferredAsset is not in the DTO", async () => {
    const merchant = merchantFixture();
    const prisma = buildPrismaMock(merchant);
    const service = new MerchantService(prisma);

    // Only updating name
    await service.updateSettings("merchant-test", { name: "New Name" });

    const updateCall = (prisma.merchant.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.assetConfiguredAt).toBeUndefined();
  });

  it("throws NotFoundException when merchant does not exist", async () => {
    const merchant = merchantFixture({ id: "other-id" });
    const prisma = buildPrismaMock(merchant);
    const service = new MerchantService(prisma);

    await expect(
      service.updateSettings("nonexistent-id", { name: "Test" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws BadRequestException for an invalid Stellar payout public key", async () => {
    const merchant = merchantFixture();
    const prisma = buildPrismaMock(merchant);
    const service = new MerchantService(prisma);

    await expect(
      service.updateSettings("merchant-test", {
        payoutPublicKey: "NOT_A_STELLAR_KEY",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── syncChecklist × updateSettings integration path ────────────────────────

describe("MerchantService — updateSettings → syncChecklist round-trip", () => {
  it("fresh merchant: profile step stays incomplete before updateSettings, completes after", async () => {
    const merchant = merchantFixture();
    const prisma = buildPrismaMock(merchant, checklistFixture());
    const service = new MerchantService(prisma);

    // Before explicit name save
    const before = await service.syncChecklist("merchant-test");
    expect(before.profileCompleted).toBe(false);

    // Simulate updateSettings stamping nameConfiguredAt
    (
      prisma._db as { merchant: ReturnType<typeof merchantFixture> }
    ).merchant.nameConfiguredAt = new Date();

    // After explicit name save
    const after = await service.syncChecklist("merchant-test");
    expect(after.profileCompleted).toBe(true);
  });

  it("fresh merchant: asset step stays incomplete before updateSettings, completes after", async () => {
    const merchant = merchantFixture();
    const prisma = buildPrismaMock(merchant, checklistFixture());
    const service = new MerchantService(prisma);

    const before = await service.syncChecklist("merchant-test");
    expect(before.assetPreferenceCompleted).toBe(false);

    // Simulate updateSettings stamping assetConfiguredAt
    (
      prisma._db as { merchant: ReturnType<typeof merchantFixture> }
    ).merchant.assetConfiguredAt = new Date();
    (
      prisma._db as { merchant: ReturnType<typeof merchantFixture> }
    ).merchant.preferredAsset = "EURC";

    const after = await service.syncChecklist("merchant-test");
    expect(after.assetPreferenceCompleted).toBe(true);
  });
});

// ── Checklist Reopening & Regression Tests ─────────────────────────────────

describe("MerchantService — checklist reopening on setup regression", () => {
  const completedDate = new Date("2026-08-01T12:00:00Z");

  const completedMerchant = () =>
    merchantFixture({
      name: "Acme Corp",
      nameConfiguredAt: new Date("2026-08-01T10:00:00Z"),
      assetConfiguredAt: new Date("2026-08-01T10:00:00Z"),
      preferredAsset: "USDC",
      payoutWallet: "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
      invoices: [{ id: "inv-1" }],
    });

  const completedChecklist = () =>
    checklistFixture({
      profileCompleted: true,
      payoutKeyCompleted: true,
      assetPreferenceCompleted: true,
      firstInvoiceCompleted: true,
      isCompleted: true,
      completedAt: completedDate,
    });

  describe("updateChecklist direct regression", () => {
    it("revokes isCompleted and clears completedAt when profileCompleted is set to false", async () => {
      const prisma = buildPrismaMock(completedMerchant(), completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.updateChecklist("merchant-test", {
        profileCompleted: false,
      });

      expect(result.profileCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
      expect(result.payoutKeyCompleted).toBe(true);
      expect(result.assetPreferenceCompleted).toBe(true);
      expect(result.firstInvoiceCompleted).toBe(true);
    });

    it("revokes isCompleted and clears completedAt when payoutKeyCompleted is set to false", async () => {
      const prisma = buildPrismaMock(completedMerchant(), completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.updateChecklist("merchant-test", {
        payoutKeyCompleted: false,
      });

      expect(result.payoutKeyCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
    });

    it("revokes isCompleted and clears completedAt when assetPreferenceCompleted is set to false", async () => {
      const prisma = buildPrismaMock(completedMerchant(), completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.updateChecklist("merchant-test", {
        assetPreferenceCompleted: false,
      });

      expect(result.assetPreferenceCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
    });

    it("revokes isCompleted and clears completedAt when firstInvoiceCompleted is set to false", async () => {
      const prisma = buildPrismaMock(completedMerchant(), completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.updateChecklist("merchant-test", {
        firstInvoiceCompleted: false,
      });

      expect(result.firstInvoiceCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
    });
  });

  describe("syncChecklist regression when merchant setup is undone", () => {
    it("reopens checklist when payout wallet is removed", async () => {
      const merchant = completedMerchant();
      merchant.payoutWallet = null; // payout wallet undone

      const prisma = buildPrismaMock(merchant, completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.payoutKeyCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
      expect(result.profileCompleted).toBe(true);
      expect(result.assetPreferenceCompleted).toBe(true);
      expect(result.firstInvoiceCompleted).toBe(true);
    });

    it("reopens checklist when merchant name is cleared to empty string", async () => {
      const merchant = completedMerchant();
      merchant.name = ""; // empty name

      const prisma = buildPrismaMock(merchant, completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
    });

    it("reopens checklist when nameConfiguredAt is reset to null", async () => {
      const merchant = completedMerchant();
      merchant.nameConfiguredAt = null;

      const prisma = buildPrismaMock(merchant, completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.profileCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
    });

    it("reopens checklist when assetConfiguredAt is reset to null", async () => {
      const merchant = completedMerchant();
      merchant.assetConfiguredAt = null;

      const prisma = buildPrismaMock(merchant, completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.assetPreferenceCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
    });

    it("reopens checklist when invoices list becomes empty", async () => {
      const merchant = completedMerchant();
      merchant.invoices = []; // invoices removed/deleted

      const prisma = buildPrismaMock(merchant, completedChecklist());
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.firstInvoiceCompleted).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
    });

    it("reopens checklist if database checklist isCompleted flag was stale/inconsistent", async () => {
      const merchant = completedMerchant();
      merchant.payoutWallet = null;

      // Checklist record has payoutKeyCompleted already false in DB, but isCompleted was true (stale)
      const staleChecklist = checklistFixture({
        profileCompleted: true,
        payoutKeyCompleted: false,
        assetPreferenceCompleted: true,
        firstInvoiceCompleted: true,
        isCompleted: true,
        completedAt: completedDate,
      });

      const prisma = buildPrismaMock(merchant, staleChecklist);
      const service = new MerchantService(prisma);

      const result = await service.syncChecklist("merchant-test");

      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
    });
  });

  describe("full lifecycle: completion -> regression -> re-completion", () => {
    it("completes, reopens on regression, and re-completes with a new timestamp when fixed", async () => {
      const merchant = completedMerchant();
      const prisma = buildPrismaMock(merchant, checklistFixture());
      const service = new MerchantService(prisma);

      // Phase 1: Initial sync completing all steps
      const phase1 = await service.syncChecklist("merchant-test");
      expect(phase1.isCompleted).toBe(true);
      expect(phase1.completedAt).toBeInstanceOf(Date);
      const initialCompletedAt = phase1.completedAt;

      // Phase 2: Merchant removes payout wallet (regression)
      (
        prisma._db as { merchant: ReturnType<typeof merchantFixture> }
      ).merchant.payoutWallet = null;

      const phase2 = await service.syncChecklist("merchant-test");
      expect(phase2.payoutKeyCompleted).toBe(false);
      expect(phase2.isCompleted).toBe(false);
      expect(phase2.completedAt).toBeNull();

      // Phase 3: Idempotent sync while in regressed state (no DB writes)
      (prisma.merchantActivationChecklist.update as jest.Mock).mockClear();
      const phase3 = await service.syncChecklist("merchant-test");
      expect(phase3.isCompleted).toBe(false);
      expect(phase3.completedAt).toBeNull();
      expect(prisma.merchantActivationChecklist.update).not.toHaveBeenCalled();

      // Phase 4: Merchant reconfigures payout wallet (re-completion)
      (
        prisma._db as { merchant: ReturnType<typeof merchantFixture> }
      ).merchant.payoutWallet =
        "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R";

      const phase4 = await service.syncChecklist("merchant-test");
      expect(phase4.payoutKeyCompleted).toBe(true);
      expect(phase4.isCompleted).toBe(true);
      expect(phase4.completedAt).toBeInstanceOf(Date);
      expect(phase4.completedAt).not.toBe(initialCompletedAt);
    });
  });

  describe("updateSettings clearing name invalidates profileCompleted and reopens checklist", () => {
    it("resets nameConfiguredAt to null when name is updated to empty string", async () => {
      const merchant = completedMerchant();
      const prisma = buildPrismaMock(merchant, completedChecklist());
      const service = new MerchantService(prisma);

      await service.updateSettings("merchant-test", { name: "   " });

      const updateCall = (prisma.merchant.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.nameConfiguredAt).toBeNull();

      // Simulate DB updated with nameConfiguredAt: null
      (
        prisma._db as { merchant: ReturnType<typeof merchantFixture> }
      ).merchant.nameConfiguredAt = null;

      const syncResult = await service.syncChecklist("merchant-test");
      expect(syncResult.profileCompleted).toBe(false);
      expect(syncResult.isCompleted).toBe(false);
      expect(syncResult.completedAt).toBeNull();
    });
  });
});
