import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { MergeCustomersDto } from "./dto/merge-customers.dto";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Customers controller
 * Manages client profiles for repeat invoicing.
 */
@Controller("customers")
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================================
  // Standard CRUD
  // =========================================================================

  /**
   * GET /customers
   * Get all customers (with optional search filter)
   */
  @Auth()
  @Get()
  async findAll(
    @CurrentUser() user: User,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 50;
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.findAll(user.merchantId, search, l),
    );
  }

  /**
   * GET /customers/search
   * Search/autocomplete customers for typeahead UI
   */
  @Auth()
  @Get("search")
  async search(
    @CurrentUser() user: User,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.search(user.merchantId, q ?? "", l),
    );
  }

  /**
   * GET /customers/:id
   * Get a single customer by ID
   */
  @Auth()
  @Get(":id")
  async findOne(@CurrentUser() user: User, @Param("id") id: string) {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.findOne(user.merchantId, id),
    );
  }

  /**
   * POST /customers
   * Create a new customer profile
   */
  @Post()
  @Auth()
  @Throttle({ default: { limit: 30, ttl: 3600 } })
  async create(@CurrentUser() user: User, @Body() dto: CreateCustomerDto) {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.create(user.merchantId, dto),
    );
  }

  /**
   * PATCH /customers/:id
   * Update an existing customer profile
   */
  @Patch(":id")
  @Auth()
  async update(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.update(user.merchantId, id, dto),
    );
  }

  /**
   * DELETE /customers/:id
   * Delete a customer profile
   */
  @Delete(":id")
  @Auth()
  async remove(@CurrentUser() user: User, @Param("id") id: string) {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.remove(user.merchantId, id),
    );
  }

  // =========================================================================
  // Duplicate detection
  // =========================================================================

  /**
   * GET /customers/:id/duplicates
   *
   * Returns a scored list of likely duplicate customers for the specified
   * customer record. Signals include:
   *   - Identical normalised email address
   *   - High token-set similarity on name
   *   - Shared email found in invoice history
   */
  @Auth()
  @Get(":id/duplicates")
  async findDuplicates(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ) {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.findDuplicates(user.merchantId, id),
    );
  }

  // =========================================================================
  // Merge
  // =========================================================================

  /**
   * POST /customers/:winnerId/merge/:loserId
   *
   * Merges the loser customer into the winner:
   *   - All invoices linked to the loser are re-pointed to the winner.
   *   - Notes are combined (appended) if distinct.
   *   - An audit log entry (CustomerMergeLog) is written.
   *   - The loser record is permanently deleted.
   *
   * Both customers must belong to the authenticated merchant; cross-merchant
   * merge attempts are rejected with 403.
   *
   * Returns the updated winner record and the merge audit log entry.
   */
  @Post(":winnerId/merge/:loserId")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600 } })
  async mergeCustomers(
    @CurrentUser() user: User,
    @Param("winnerId") winnerId: string,
    @Param("loserId") loserId: string,
    @Body() dto: MergeCustomersDto,
  ) {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.merge(
        user.merchantId,
        winnerId,
        loserId,
        dto,
        (user as any).publicKey,
      ),
    );
  }
}
