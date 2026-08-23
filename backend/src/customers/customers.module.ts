import { Module } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

/**
 * Customers module
 * Provides the merchant's saved-customer directory: profile CRUD,
 * search/typeahead for reuse during invoice creation (e.g. the mobile
 * customer picker), and a business-metrics summary.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
