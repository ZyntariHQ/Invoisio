import { apiClient } from "./api-client";

export interface Customer {
  id: string;
  merchantId: string;
  name: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerPayload {
  name: string;
  email?: string;
  notes?: string;
}

export const CustomerService = {
  /**
   * Search customers for autocomplete/typeahead.
   */
  async search(query: string, limit = 10): Promise<Customer[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await apiClient.get<Customer[]>(
      `/customers/search?${params}`,
    );
    return response.data;
  },

  /**
   * Fetch all customers with optional search.
   */
  async list(search?: string, limit = 50): Promise<Customer[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (search?.trim()) params.set("search", search.trim());
    const response = await apiClient.get<Customer[]>(`/customers?${params}`);
    return response.data;
  },

  /**
   * Create a new customer profile.
   */
  async create(payload: CreateCustomerPayload): Promise<Customer> {
    const response = await apiClient.post<Customer>("/customers", payload);
    return response.data;
  },

  /**
   * Update an existing customer.
   */
  async update(
    id: string,
    payload: Partial<CreateCustomerPayload>,
  ): Promise<Customer> {
    const response = await apiClient.patch<Customer>(
      `/customers/${id}`,
      payload,
    );
    return response.data;
  },

  /**
   * Delete a customer.
   */
  async remove(id: string): Promise<void> {
    await apiClient.delete(`/customers/${id}`);
  },
};
