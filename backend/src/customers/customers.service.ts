import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { MergeCustomersDto } from "./dto/merge-customers.dto";
import {
  DuplicateMatch,
  FindDuplicatesResponseDto,
} from "./dto/find-duplicates-response.dto";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a customer name for fuzzy comparison:
 *  - lower-case
 *  - collapse whitespace
 *  - strip common legal suffixes (Ltd, Inc, LLC, …)
 */
function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(ltd|inc|llc|gmbh|plc|co|corp|limited|incorporated)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Very lightweight token-set similarity: Jaccard index on word tokens.
 * Returns a value in [0, 1].
 */
function tokenSetSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Customers service — manages client profiles for repeat invoicing.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // CRUD
  // =========================================================================

  /**
   * Create a new customer for the given merchant.
   * Enforces uniqueness on (merchantId, email) when email is provided.
   */
  async create(merchantId: string, dto: CreateCustomerDto) {
    try {
      return await this.prisma.customer.create({
        data: {
          merchantId,
          name: dto.name.trim(),
          email: dto.email?.trim().toLowerCase() || null,
          notes: dto.notes?.trim() || null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "A customer with this email already exists for this merchant",
        );
      }
      throw error;
    }
  }

  /**
   * Find all customers for a merchant with optional search.
   */
  async findAll(merchantId: string, search?: string, limit = 50) {
    const where: Prisma.CustomerWhereInput = { merchantId };

    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Find a single customer by ID, scoped to merchant.
   */
  async findOne(merchantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, merchantId },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return customer;
  }

  /**
   * Update a customer profile.
   */
  async update(merchantId: string, customerId: string, dto: UpdateCustomerDto) {
    await this.findOne(merchantId, customerId);

    const updateData: Prisma.CustomerUpdateInput = {};
    if (dto.name !== undefined) updateData.name = dto.name.trim();
    if (dto.email !== undefined)
      updateData.email = dto.email?.trim().toLowerCase() || null;
    if (dto.notes !== undefined) updateData.notes = dto.notes?.trim() || null;

    try {
      return await this.prisma.customer.update({
        where: { id: customerId },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "A customer with this email already exists for this merchant",
        );
      }
      throw error;
    }
  }

  /**
   * Delete a customer profile.
   */
  async remove(merchantId: string, customerId: string) {
    await this.findOne(merchantId, customerId);
    await this.prisma.customer.delete({ where: { id: customerId } });
    return { id: customerId, deleted: true };
  }

  /**
   * Search/autocomplete customers by name or email.
   * Returns a limited set of results for typeahead UI.
   */
  async search(merchantId: string, query: string, limit = 10) {
    if (!query?.trim()) {
      return this.prisma.customer.findMany({
        where: { merchantId },
        orderBy: { updatedAt: "desc" },
        take: limit,
      });
    }

    const q = query.trim();
    return this.prisma.customer.findMany({
      where: {
        merchantId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  }

  // =========================================================================
  // Duplicate detection
  // =========================================================================

  /**
   * Find likely duplicate customers for a given customer record.
   *
   * Scoring rules (additive, capped at 1.0):
   *  +0.6  exact email match (normalised)
   *  +0.3  normalised name similarity ≥ 0.8  (token-set Jaccard)
   *  +0.2  normalised name similarity ≥ 0.5
   *  +0.1  at least one invoice clientEmail matches the other record's email
   *
   * Only candidates with score > 0 are returned, ordered descending.
   */
  async findDuplicates(
    merchantId: string,
    customerId: string,
  ): Promise<FindDuplicatesResponseDto> {
    const target = await this.findOne(merchantId, customerId);

    // Fetch all other customers for this merchant (with invoice count)
    const peers = await this.prisma.customer.findMany({
      where: { merchantId, id: { not: customerId } },
      include: {
        _count: { select: { invoices: true } },
      },
    });

    const targetNorm = normaliseName(target.name);
    const targetEmail = target.email?.toLowerCase() ?? null;

    // Collect invoice clientEmails for the target customer for hint matching
    const targetInvoiceEmails = await this.getCustomerInvoiceEmails(customerId);

    const matches: DuplicateMatch[] = [];

    for (const peer of peers) {
      const reasons: string[] = [];
      let score = 0;

      // --- Email match ---
      const peerEmail = peer.email?.toLowerCase() ?? null;
      if (targetEmail && peerEmail && targetEmail === peerEmail) {
        reasons.push("Identical email address");
        score += 0.6;
      }

      // --- Normalised name similarity ---
      const peerNorm = normaliseName(peer.name);
      const nameSim = tokenSetSimilarity(targetNorm, peerNorm);

      if (nameSim >= 0.8) {
        reasons.push(
          `Very similar name (${Math.round(nameSim * 100)}% token match)`,
        );
        score += 0.3;
      } else if (nameSim >= 0.5) {
        reasons.push(
          `Similar name (${Math.round(nameSim * 100)}% token match)`,
        );
        score += 0.2;
      }

      // --- Invoice history hint ---
      // Does an invoice linked to the peer have a clientEmail that matches the
      // target's email (or vice-versa)?
      if (targetEmail || peerEmail) {
        const peerInvoiceEmails = await this.getCustomerInvoiceEmails(peer.id);

        const targetEmailMatchesPeerInvoice =
          targetEmail !== null && peerInvoiceEmails.has(targetEmail);
        const peerEmailMatchesTargetInvoice =
          peerEmail !== null && targetInvoiceEmails.has(peerEmail);

        if (targetEmailMatchesPeerInvoice || peerEmailMatchesTargetInvoice) {
          reasons.push("Shared email found in invoice history");
          score += 0.1;
        }
      }

      if (score > 0) {
        matches.push({
          candidate: {
            id: peer.id,
            name: peer.name,
            email: peer.email,
            invoiceCount: peer._count.invoices,
            createdAt: peer.createdAt,
          },
          reasons,
          score: Math.min(score, 1),
        });
      }
    }

    // Sort by descending score
    matches.sort((a, b) => b.score - a.score);

    return { customerId, matches };
  }

  // =========================================================================
  // Merge
  // =========================================================================

  /**
   * Merge two customer records belonging to the same merchant.
   *
   * Steps (all inside a single transaction):
   *  1. Verify both records exist and belong to the authenticated merchant.
   *  2. Reject self-merge attempts.
   *  3. Re-point all invoices from loser → winner.
   *  4. Merge notes (append loser notes to winner if distinct).
   *  5. Write a CustomerMergeLog audit record.
   *  6. Delete the loser record.
   *
   * Returns the updated winner record plus the merge log entry.
   */
  async merge(
    merchantId: string,
    winnerId: string,
    loserId: string,
    dto: MergeCustomersDto,
    actorPublicKey?: string,
  ) {
    if (winnerId === loserId) {
      throw new BadRequestException("Cannot merge a customer with itself");
    }

    // Both records must belong to this merchant (cross-merchant guard)
    const [winner, loser] = await Promise.all([
      this.prisma.customer.findFirst({ where: { id: winnerId, merchantId } }),
      this.prisma.customer.findFirst({ where: { id: loserId, merchantId } }),
    ]);

    if (!winner) {
      throw new NotFoundException(`Winner customer '${winnerId}' not found`);
    }
    if (!loser) {
      throw new NotFoundException(`Loser customer '${loserId}' not found`);
    }

    // Guard: both must belong to this merchant (redundant but explicit)
    if (winner.merchantId !== merchantId || loser.merchantId !== merchantId) {
      throw new ForbiddenException(
        "Cross-merchant merge is not permitted",
      );
    }

    // Snapshot the loser before anything is changed
    const loserSnapshot = { ...loser } as Record<string, unknown>;

    return this.prisma.$transaction(async (tx) => {
      // 1. Re-point invoices from loser → winner
      const { count: invoicesRelinked } = await tx.invoice.updateMany({
        where: { customerId: loserId, merchantId },
        data: { customerId: winnerId },
      });

      // 2. Merge notes
      let mergedNotes = winner.notes ?? null;
      if (loser.notes && loser.notes !== winner.notes) {
        mergedNotes = [winner.notes, loser.notes].filter(Boolean).join("\n---\n");
      }

      // 3. Update winner record (notes only; we keep the winner's name/email)
      const updatedWinner = await tx.customer.update({
        where: { id: winnerId },
        data: { notes: mergedNotes },
        include: { _count: { select: { invoices: true } } },
      });

      // 4. Write audit log
      const mergeLog = await tx.customerMergeLog.create({
        data: {
          merchantId,
          winnerId,
          loserId,
          loserSnapshot,
          invoicesRelinked,
          mergedBy: actorPublicKey ?? null,
          mergeNote: dto.mergeNote?.trim() || null,
        },
      });

      // 5. Delete the loser (invoices already re-pointed, FK is SetNull on log)
      await tx.customer.delete({ where: { id: loserId } });

      this.logger.log(
        `Merchant ${merchantId}: merged customer ${loserId} → ${winnerId} ` +
          `(${invoicesRelinked} invoices relinked)`,
      );

      return {
        winner: updatedWinner,
        mergeLog,
      };
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Returns the set of lower-cased clientEmail values from invoices
   * linked to the given customer.
   */
  private async getCustomerInvoiceEmails(customerId: string): Promise<Set<string>> {
    const rows = await this.prisma.invoice.findMany({
      where: { customerId },
      select: { clientEmail: true },
    });
    return new Set(
      rows
        .map((r) => r.clientEmail?.toLowerCase())
        .filter((e): e is string => Boolean(e)),
    );
  }
}
