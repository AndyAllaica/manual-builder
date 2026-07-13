import { type Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
