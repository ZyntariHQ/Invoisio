import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { Prisma } from "@prisma/client";

/**
 * Customers service — manages client profiles for repeat invoicing.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    // Ensure customer exists and belongs to merchant
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
}
