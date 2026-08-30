import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

export const UNSCOPED_MERCHANT_CONTEXT = Symbol("UNSCOPED_MERCHANT_CONTEXT");

type MerchantScopeStore = {
  merchantId: string | typeof UNSCOPED_MERCHANT_CONTEXT;
};

@Injectable()
export class MerchantContextService {
  private readonly storage = new AsyncLocalStorage<MerchantScopeStore>();

  runWithMerchantScope<T>(
    merchantId: string,
    callback: () => Promise<T> | T,
  ): Promise<T> {
    return Promise.resolve(this.storage.run({ merchantId }, callback));
  }

  runUnscoped<T>(callback: () => Promise<T> | T): Promise<T> {
    return Promise.resolve(
      this.storage.run({ merchantId: UNSCOPED_MERCHANT_CONTEXT }, callback),
    );
  }

  getMerchantId(): string | typeof UNSCOPED_MERCHANT_CONTEXT | undefined {
    return this.storage.getStore()?.merchantId;
  }
}
