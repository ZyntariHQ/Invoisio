import { BadRequestException } from "@nestjs/common";

export interface ActivityCursor {
  createdAt: Date;
  id: string;
}

interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeActivityCursor(createdAt: Date, id: string): string {
  const payload: CursorPayload = {
    createdAt: createdAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeActivityCursor(cursor: string): ActivityCursor {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<CursorPayload>;
    const createdAt = new Date(parsed.createdAt ?? "");
    if (!parsed.id || Number.isNaN(createdAt.getTime())) {
      throw new Error("Malformed cursor");
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Invalid cursor");
  }
}
