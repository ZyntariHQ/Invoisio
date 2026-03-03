import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { Logger } from "@nestjs/common";

/**
 * Base exception for Stellar-related errors
 */
export class StellarException extends Error {
  constructor(
    message: string,
    public readonly code: string = "STELLAR_ERROR",
    public readonly statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(message);
    this.name = "StellarException";
  }
}

/**
 * Exception thrown when Stellar account is not found (404)
 */
export class StellarAccountNotFoundException extends StellarException {
  constructor(publicKey: string) {
    super(
      `Account not found: ${publicKey}`,
      "STELLAR_ACCOUNT_NOT_FOUND",
      HttpStatus.NOT_FOUND,
    );
    this.name = "StellarAccountNotFoundException";
  }
}

/**
 * Exception thrown when payment/transaction is not found
 */
export class StellarPaymentNotFoundException extends StellarException {
  constructor(memo?: string, transactionHash?: string) {
    super(
      `Payment not found${memo ? ` with memo: ${memo}` : ""}${transactionHash ? ` for transaction: ${transactionHash}` : ""}`,
      "STELLAR_PAYMENT_NOT_FOUND",
      HttpStatus.NOT_FOUND,
    );
    this.name = "StellarPaymentNotFoundException";
  }
}

/**
 * Exception thrown when Stellar address validation fails
 */
export class StellarAddressInvalidException extends StellarException {
  constructor(
    address: string,
    addressType: "account" | "contract" = "account",
  ) {
    super(
      `Invalid Stellar ${addressType} address: ${address}`,
      "STELLAR_ADDRESS_INVALID",
      HttpStatus.BAD_REQUEST,
    );
    this.name = "StellarAddressInvalidException";
  }
}

/**
 * Exception thrown when Horizon API returns an error
 */
export class HorizonApiException extends StellarException {
  constructor(
    message: string,
    public readonly horizonStatusCode: number,
    public readonly originalError?: any,
  ) {
    super(
      message,
      "HORIZON_API_ERROR",
      horizonStatusCode === 429
        ? HttpStatus.TOO_MANY_REQUESTS
        : horizonStatusCode >= 500
          ? HttpStatus.BAD_GATEWAY
          : HttpStatus.INTERNAL_SERVER_ERROR,
    );
    this.name = "HorizonApiException";
  }
}

/**
 * Exception thrown when Soroban RPC call fails
 */
export class SorobanRpcException extends StellarException {
  constructor(
    message: string,
    public readonly rpcCode?: number,
    public readonly originalError?: any,
  ) {
    super(message, "SOROBAN_RPC_ERROR", HttpStatus.INTERNAL_SERVER_ERROR);
    this.name = "SorobanRpcException";
  }
}

/**
 * Exception thrown when network configuration is invalid
 */
export class StellarNetworkConfigException extends StellarException {
  constructor(message: string) {
    super(
      message,
      "STELLAR_NETWORK_CONFIG_ERROR",
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    this.name = "StellarNetworkConfigException";
  }
}

/**
 * Exception filter for Stellar exceptions
 * Handles all Stellar-related exceptions and returns formatted responses
 */
@Catch(StellarException)
export class StellarExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StellarExceptionFilter.name);

  catch(exception: StellarException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error(
      `Stellar exception: ${exception.code} - ${exception.message}`,
      exception.stack,
    );

    response.status(exception.statusCode).json({
      statusCode: exception.statusCode,
      code: exception.code,
      message: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}
