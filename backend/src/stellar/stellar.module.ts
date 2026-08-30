import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StellarService } from "./stellar.service";
import { StellarValidator } from "./utils/stellar.validator";
// Import from soroban/ (correct service)
import { SorobanService } from "../soroban/soroban.service";

@Module({
  imports: [ConfigModule],
  providers: [
    StellarService,
    SorobanService,
    {
      provide: "STELLAR_VALIDATOR",
      useValue: StellarValidator,
    },
  ],
  exports: [StellarService, SorobanService, "STELLAR_VALIDATOR"],
})
export class StellarModule {}
