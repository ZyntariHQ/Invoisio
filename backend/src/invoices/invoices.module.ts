import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { StellarModule } from "../stellar/stellar.module";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaModule } from "../prisma/prisma.module";

/**
 * Invoices module
 * Provides invoice management functionality with in-memory storage
 */
@Module({
  imports: [
    StellarModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "1d" },
      }),
    }),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, AuthGuard],
  exports: [InvoicesService],
})
export class InvoicesModule {}
