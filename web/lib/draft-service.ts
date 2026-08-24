import { apiClient } from "./api-client";
import type {
  DraftInvoice,
  CreateDraftDto,
  UpdateDraftDto,
  DraftListResponse,
  DiscardDraftResponse,
} from "./types/draft.types";

/**
 * DraftService handles all draft-related API operations
 * Provides methods for creating, updating, retrieving, and managing invoice drafts
 */
export class DraftService {
  private static readonly BASE_PATH = "/invoices/draft";

  /**
   * Create a new draft invoice
   * @param dto - Draft creation data
   * @returns The created draft
   */
  static async createDraft(dto: CreateDraftDto): Promise<DraftInvoice> {
    const response = await apiClient.post(this.BASE_PATH, dto);
    return response.data;
  }

  /**
   * Get all drafts for the authenticated merchant
   * @param page - Page number (1-indexed)
   * @param limit - Items per page
   * @returns Paginated draft list
   */
  static async getDrafts(page = 1, limit = 20): Promise<DraftListResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    }).toString();
    const response = await apiClient.get(`${this.BASE_PATH}?${params}`);
    return response.data;
  }

  /**
   * Get a specific draft by ID
   * @param id - Draft UUID
   * @returns The draft data
   */
  static async getDraft(id: string): Promise<DraftInvoice> {
    const response = await apiClient.get(`${this.BASE_PATH}/${id}`);
    return response.data;
  }

  /**
   * Update a draft (full update)
   * @param id - Draft UUID
   * @param updates - Draft update data
   * @returns Updated draft
   */
  static async updateDraft(id: string, updates: UpdateDraftDto): Promise<DraftInvoice> {
    const response = await apiClient.patch(`${this.BASE_PATH}/${id}`, updates);
    return response.data;
  }

  /**
   * Auto-save a draft (optimized for frequent calls)
   * @param id - Draft UUID
   * @param updates - Draft update data
   * @returns Updated draft
   */
  static async autoSaveDraft(id: string, updates: UpdateDraftDto): Promise<DraftInvoice> {
    const response = await apiClient.patch(`${this.BASE_PATH}/${id}/autosave`, {
      ...updates,
      autoSave: true,
    });
    return response.data;
  }

  /**
   * Convert a draft to a real invoice
   * @param id - Draft UUID
   * @returns The converted invoice
   */
  static async convertDraftToInvoice(id: string): Promise<unknown> {
    const response = await apiClient.post(`${this.BASE_PATH}/${id}/convert`);
    return response.data;
  }

  /**
   * Discard/delete a draft
   * @param id - Draft UUID
   * @returns Discard confirmation
   */
  static async discardDraft(id: string): Promise<DiscardDraftResponse> {
    const response = await apiClient.delete(`${this.BASE_PATH}/${id}`);
    return response.data;
  }

  /**
   * Check if a draft has all required fields to be converted to an invoice
   * @param draft - Draft invoice data
   * @returns Boolean indicating if draft is complete
   */
  static isDraftComplete(draft: Partial<DraftInvoice>): boolean {
    return !!(draft.clientName?.trim() && 
              draft.clientEmail?.trim() && 
              draft.amount && 
              draft.amount > 0 &&
              draft.assetCode);
  }

  /**
   * Get the completion percentage of a draft
   * @param draft - Draft invoice data
   * @returns Completion percentage (0-100)
   */
  static getCompletionPercentage(draft: Partial<DraftInvoice>): number {
    const fields = [
      { key: 'invoiceNumber', weight: 1 },
      { key: 'clientName', weight: 1 },
      { key: 'clientEmail', weight: 1 },
      { key: 'description', weight: 0.5 },
      { key: 'amount', weight: 1 },
      { key: 'assetCode', weight: 1 },
      { key: 'dueDate', weight: 0.5 },
    ];

    let totalWeight = 0;
    let filledWeight = 0;

    for (const field of fields) {
      totalWeight += field.weight;
      const value = draft[field.key as keyof typeof draft];
      if (value !== undefined && value !== null && value !== '') {
        filledWeight += field.weight;
      }
    }

    return Math.round((filledWeight / totalWeight) * 100);
  }

  /**
   * Format a draft for display in UI
   * @param draft - Draft invoice data
   * @returns Formatted draft with computed fields
   */
  static formatDraftForDisplay(draft: DraftInvoice): DraftInvoice & {
    displayName: string;
    displayAmount: string;
    hasRequiredFields: boolean;
    completionPercentage: number;
  } {
    const hasRequiredFields = this.isDraftComplete(draft);
    const completionPercentage = this.getCompletionPercentage(draft);
    
    return {
      ...draft,
      displayName: draft.clientName || 'Untitled Draft',
      displayAmount: draft.amount ? draft.amount.toFixed(2) : '0.00',
      hasRequiredFields,
      completionPercentage,
    };
  }
}