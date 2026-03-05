import { Module } from "@nestjs/common";
import { HorizonWatcherService } from "./horizon-watcher.service";
import { StellarModule } from "./stellar.module";
import { InvoicesModule } from "../invoices/invoices.module";

@Module({
  imports: [StellarModule, InvoicesModule],
  providers: [HorizonWatcherService],
  exports: [HorizonWatcherService],
})
export class HorizonWatcherModule {}
