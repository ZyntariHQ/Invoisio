import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

type MerchantScopeStore = {
  merchantId: string;
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

  getMerchantId(): string | undefined {
    return this.storage.getStore()?.merchantId;
  }
}
