import axios from 'axios';
import { API_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  DraftInvoice,
  CreateDraftDto,
  UpdateDraftDto,
  DraftListResponse,
  DiscardDraftResponse,
  LocalDraft,
} from '../types/draft.types';

const DRAFT_STORAGE_KEY = '@invoisio_local_drafts';
const DRAFT_SYNC_KEY = '@invoisio_draft_sync';

/**
 * DraftService handles all draft-related API operations on mobile
 * Provides methods for creating, updating, retrieving, and managing invoice drafts
 * with offline support
 */
export class DraftService {
  private static readonly BASE_PATH = '/invoices/draft';

  /**
   * Create a new draft invoice
   * @param token - Access token for authentication
   * @param dto - Draft creation data
   * @returns The created draft
   */
  static async createDraft(
    token: string,
    dto: CreateDraftDto,
  ): Promise<DraftInvoice> {
    const response = await axios.post(
      `${API_URL}${this.BASE_PATH}`,
      dto,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data as DraftInvoice;
  }

  /**
   * Get all drafts for the authenticated merchant
   * @param token - Access token for authentication
   * @param page - Page number (1-indexed)
   * @param limit - Items per page
   * @returns Paginated draft list
   */
  static async getDrafts(
    token: string,
    page = 1,
    limit = 20,
  ): Promise<DraftListResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    }).toString();
    const response = await axios.get(
      `${API_URL}${this.BASE_PATH}?${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data as DraftListResponse;
  }

  /**
   * Get a specific draft by ID
   * @param token - Access token for authentication
   * @param id - Draft UUID
   * @returns The draft data
   */
  static async getDraft(token: string, id: string): Promise<DraftInvoice> {
    const response = await axios.get(
      `${API_URL}${this.BASE_PATH}/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data as DraftInvoice;
  }

  /**
   * Update a draft (full update)
   * @param token - Access token for authentication
   * @param id - Draft UUID
   * @param updates - Draft update data
   * @returns Updated draft
   */
  static async updateDraft(
    token: string,
    id: string,
    updates: UpdateDraftDto,
  ): Promise<DraftInvoice> {
    const response = await axios.patch(
      `${API_URL}${this.BASE_PATH}/${id}`,
      updates,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data as DraftInvoice;
  }

  /**
   * Auto-save a draft (optimized for frequent calls)
   * @param token - Access token for authentication
   * @param id - Draft UUID
   * @param updates - Draft update data
   * @returns Updated draft
   */
  static async autoSaveDraft(
    token: string,
    id: string,
    updates: UpdateDraftDto,
  ): Promise<DraftInvoice> {
    const response = await axios.patch(
      `${API_URL}${this.BASE_PATH}/${id}/autosave`,
      {
        ...updates,
        autoSave: true,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data as DraftInvoice;
  }

  /**
   * Convert a draft to a real invoice
   * @param token - Access token for authentication
   * @param id - Draft UUID
   * @returns The converted invoice
   */
  static async convertDraftToInvoice(token: string, id: string): Promise<unknown> {
    const response = await axios.post(
      `${API_URL}${this.BASE_PATH}/${id}/convert`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  }

  /**
   * Discard/delete a draft
   * @param token - Access token for authentication
   * @param id - Draft UUID
   * @returns Discard confirmation
   */
  static async discardDraft(token: string, id: string): Promise<DiscardDraftResponse> {
    const response = await axios.delete(
      `${API_URL}${this.BASE_PATH}/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data as DiscardDraftResponse;
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
   * Save draft locally for offline support
   * @param draft - Draft data to save locally
   */
  static async saveLocalDraft(draft: LocalDraft): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      let drafts: LocalDraft[] = stored ? JSON.parse(stored) : [];
      const index = drafts.findIndex((d) => d.id === draft.id);
      if (index >= 0) {
        drafts[index] = draft;
      } else {
        drafts.push(draft);
      }
      await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
      console.error('Failed to save local draft:', error);
    }
  }

  /**
   * Get local drafts
   * @returns Array of local drafts
   */
  static async getLocalDrafts(): Promise<LocalDraft[]> {
    try {
      const stored = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get local drafts:', error);
      return [];
    }
  }

  /**
   * Get a specific local draft by ID
   * @param id - Draft UUID
   * @returns Local draft or null if not found
   */
  static async getLocalDraft(id: string): Promise<LocalDraft | null> {
    const drafts = await this.getLocalDrafts();
    return drafts.find((d) => d.id === id) || null;
  }

  /**
   * Delete local draft
   * @param id - Draft UUID
   */
  static async deleteLocalDraft(id: string): Promise<void> {
    try {
      const drafts = await this.getLocalDrafts();
      const filtered = drafts.filter((d) => d.id !== id);
      await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to delete local draft:', error);
    }
  }

  /**
   * Sync local drafts with server
   * @param token - Access token for authentication
   */
  static async syncLocalDrafts(token: string): Promise<void> {
    try {
      const drafts = await this.getLocalDrafts();
      const unsynced = drafts.filter((d) => !d.isSynced);

      for (const localDraft of unsynced) {
        try {
          if (localDraft.pendingUpdates) {
            // Update existing draft
            await this.autoSaveDraft(
              token,
              localDraft.id,
              localDraft.pendingUpdates,
            );
          } else if (localDraft.data) {
            // Create new draft
            const created = await this.createDraft(
              token,
              localDraft.data as CreateDraftDto,
            );
            localDraft.id = created.id;
          }
          localDraft.isSynced = true;
          await this.saveLocalDraft(localDraft);
        } catch (error) {
          console.error('Failed to sync draft:', error);
        }
      }
    } catch (error) {
      console.error('Failed to sync local drafts:', error);
    }
  }

  /**
   * Get sync status
   */
  static async getSyncStatus(): Promise<{ total: number; unsynced: number }> {
    const drafts = await this.getLocalDrafts();
    return {
      total: drafts.length,
      unsynced: drafts.filter((d) => !d.isSynced).length,
    };
  }

  /**
   * Clear all local drafts
   */
  static async clearLocalDrafts(): Promise<void> {
    try {
      await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear local drafts:', error);
    }
  }
}