import axios from "axios";
import { API_URL } from "@env";

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

/**
 * CustomerService – API methods for customer profile management.
 */
export const CustomerService = {
  /**
   * Search customers for autocomplete/typeahead.
   */
  async search(
    accessToken: string,
    query: string,
    limit = 10,
  ): Promise<Customer[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await axios.get<Customer[]>(
      `${API_URL}/customers/search?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return response.data;
  },

  /**
   * Fetch all customers.
   */
  async list(
    accessToken: string,
    search?: string,
    limit = 50,
  ): Promise<Customer[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (search?.trim()) params.set("search", search.trim());
    const response = await axios.get<Customer[]>(
      `${API_URL}/customers?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return response.data;
  },

  /**
   * Create a new customer profile.
   */
  async create(
    accessToken: string,
    payload: CreateCustomerPayload,
  ): Promise<Customer> {
    const response = await axios.post<Customer>(
      `${API_URL}/customers`,
      payload,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return response.data;
  },

  /**
   * Update an existing customer.
   */
  async update(
    accessToken: string,
    id: string,
    payload: Partial<CreateCustomerPayload>,
  ): Promise<Customer> {
    const response = await axios.patch<Customer>(
      `${API_URL}/customers/${id}`,
      payload,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return response.data;
  },

  /**
   * Delete a customer.
   */
  async remove(accessToken: string, id: string): Promise<void> {
    await axios.delete(`${API_URL}/customers/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
};
