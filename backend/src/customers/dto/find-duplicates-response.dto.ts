/**
 * A single duplicate-candidate match returned by the detection endpoint.
 */
export class DuplicateMatch {
  /** The already-existing customer that may be a duplicate. */
  candidate: {
    id: string;
    name: string;
    email: string | null;
    invoiceCount: number;
    createdAt: Date;
  };

  /** Reasons this pair is considered a likely duplicate. */
  reasons: string[];

  /** Composite confidence score in the range [0, 1]. */
  score: number;
}

/**
 * Response shape for GET /customers/:id/duplicates
 */
export class FindDuplicatesResponseDto {
  /** The customer whose duplicates were requested. */
  customerId: string;

  /** Ordered list of likely duplicates (highest score first). */
  matches: DuplicateMatch[];
}
