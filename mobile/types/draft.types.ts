/**
 * Draft invoice data structure for mobile
 */
export interface DraftInvoice {
  id: string;
  merchantId: string;
  userId?: string;
  invoiceNumber?: string;
  clientName?: string;
  clientEmail?: string;
  description?: string;
  amount?: number;
  assetCode?: string;
  assetIssuer?: string;
  customerId?: string;
  dueDate?: string | Date;
  isDraft: boolean;
  draftVersion: number;
  lastAutoSavedAt?: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  metadata?: Record<string, unknown>;
  // Computed fields for UI
  hasRequiredFields?: boolean;
  completionPercentage?: number;
}

/**
 * DTO for creating a new draft
 */
export interface CreateDraftDto {
  invoiceNumber?: string;
  clientName?: string;
  clientEmail?: string;
  description?: string;
  amount?: number;
  asset_code?: string;
  asset_issuer?: string;
  customer_id?: string;
  due_date?: string;
  metadata?: Record<string, unknown>;
}

/**
 * DTO for updating a draft
 */
export interface UpdateDraftDto extends Partial<CreateDraftDto> {
  id?: string;
  autoSave?: boolean;
}

/**
 * Paginated draft response
 */
export interface DraftListResponse {
  items: DraftInvoice[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Draft service response for discard operation
 */
export interface DiscardDraftResponse {
  id: string;
  discarded: boolean;
}

/**
 * Local draft storage for offline support
 */
export interface LocalDraft {
  id: string;
  data: Partial<DraftInvoice>;
  lastSavedAt: number;
  isSynced: boolean;
  pendingUpdates?: UpdateDraftDto;
}