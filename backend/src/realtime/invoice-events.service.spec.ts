import { firstValueFrom, take, toArray } from "rxjs";
import {
  InvoiceEventsService,
  InvoiceStatusEvent,
} from "./invoice-events.service";

describe("InvoiceEventsService", () => {
  let service: InvoiceEventsService;

  beforeEach(() => {
    service = new InvoiceEventsService();
  });

  it("delivers a published event only to subscribers scoped to that merchant", async () => {
    const merchantAEvents$ = service.streamForMerchant("merchant-a");
    const merchantBEvents$ = service.streamForMerchant("merchant-b");

    const merchantAPromise = firstValueFrom(merchantAEvents$);
    const receivedByB: unknown[] = [];
    const subB = merchantBEvents$.subscribe((e) => receivedByB.push(e));

    const event: InvoiceStatusEvent = {
      merchantId: "merchant-a",
      invoiceId: "inv-1",
      status: "paid",
      at: "2026-08-16T00:00:00.000Z",
    };
    service.publishStatusChange(event);

    await expect(merchantAPromise).resolves.toEqual({ data: event });
    expect(receivedByB).toEqual([]);
    subB.unsubscribe();
  });

  it("streams multiple sequential events to the same merchant in order", async () => {
    const events$ = service.streamForMerchant("merchant-a");
    const resultPromise = firstValueFrom(events$.pipe(take(2), toArray()));

    const first: InvoiceStatusEvent = {
      merchantId: "merchant-a",
      invoiceId: "inv-1",
      status: "pending",
      at: "2026-08-16T00:00:00.000Z",
    };
    const second: InvoiceStatusEvent = {
      merchantId: "merchant-a",
      invoiceId: "inv-1",
      status: "paid",
      at: "2026-08-16T00:01:00.000Z",
    };

    service.publishStatusChange(first);
    service.publishStatusChange(second);

    await expect(resultPromise).resolves.toEqual([
      { data: first },
      { data: second },
    ]);
  });

  it("does not throw when publishing with no active subscribers", () => {
    expect(() => {
      service.publishStatusChange({
        merchantId: "merchant-a",
        invoiceId: "inv-1",
        status: "paid",
        at: "2026-08-16T00:00:00.000Z",
      });
    }).not.toThrow();
  });
});
