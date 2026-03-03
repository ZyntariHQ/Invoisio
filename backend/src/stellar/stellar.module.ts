import { Module } from "@nestjs/common";
import { StellarService } from "./stellar.service";
import { StellarValidator } from "./utils/stellar.validator";
import {
  StellarExceptionFilter,
  StellarException,
  StellarAccountNotFoundException,
  StellarPaymentNotFoundException,
  StellarAddressInvalidException,
  HorizonApiException,
  SorobanRpcException,
  StellarNetworkConfigException,
} from "./exceptions/stellar.exceptions";

@Module({
  providers: [
    StellarService,
    {
      provide: "STELLAR_VALIDATOR",
      useValue: StellarValidator,
    },
  ],
  exports: [
    StellarService,
    "STELLAR_VALIDATOR",
    StellarExceptionFilter,
    StellarException,
    StellarAccountNotFoundException,
    StellarPaymentNotFoundException,
    StellarAddressInvalidException,
    HorizonApiException,
    SorobanRpcException,
    StellarNetworkConfigException,
  ],
})
export class StellarModule {}
