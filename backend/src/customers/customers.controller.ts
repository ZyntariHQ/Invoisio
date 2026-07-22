import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
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

  /**
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
   * Delete a customer profile
   */
  @Delete(":id")
  @Auth()
  async remove(@CurrentUser() user: User, @Param("id") id: string) {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.customersService.remove(user.merchantId, id),
    );
  }
}
