import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StellarService } from "./stellar.service";
import { StellarValidator } from "./utils/stellar.validator";

@Module({
  imports: [ConfigModule],
  providers: [
    StellarService,
    {
      provide: "STELLAR_VALIDATOR",
      useValue: StellarValidator,
    },
  ],
  exports: [StellarService, "STELLAR_VALIDATOR"],
})
export class StellarModule {}
