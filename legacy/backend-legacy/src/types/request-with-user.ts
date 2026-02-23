import type { Request } from 'express';
import type { User } from '@prisma/client';

export interface RequestWithUser extends Request {
  user: User;
}
