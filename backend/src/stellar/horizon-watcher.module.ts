import { Module } from "@nestjs/common";
import { HorizonWatcherService } from "./horizon-watcher.service";
import { StellarModule } from "./stellar.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [StellarModule, InvoicesModule, PrismaModule],
  providers: [HorizonWatcherService],
  exports: [HorizonWatcherService],
})
export class HorizonWatcherModule {}
