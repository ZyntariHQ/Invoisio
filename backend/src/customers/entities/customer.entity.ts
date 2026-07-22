export class Customer {
  id: string;
  merchantId: string;
  name: string;
  email?: string | null;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
