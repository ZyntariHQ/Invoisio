import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";

export interface InvoiceStatusEvent {
  merchantId: string;
  invoiceId: string;
  status: string;
  at: string;
}

@Injectable()
export class InvoiceEventsService {
  private readonly events = new Subject<InvoiceStatusEvent>();

  publishStatusChange(event: InvoiceStatusEvent): void {
    this.events.next(event);
  }

  streamForMerchant(
    merchantId: string,
  ): Observable<{ data: InvoiceStatusEvent }> {
    return this.events.pipe(
      filter((event) => event.merchantId === merchantId),
      map((event) => ({ data: event })),
    );
  }
}
