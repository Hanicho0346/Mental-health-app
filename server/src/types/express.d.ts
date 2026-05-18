import type { Types } from 'mongoose';
import type { UserRole } from './roles.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by `requireAuth`. Present on routes mounted after that middleware.
       */
      userId?: string;

      /** Set by `requireAuth` alongside `userId`. */
      userObjectId?: Types.ObjectId;

      /** JWT-derived payload (`id` matches `userId`). Set by `requireAuth`. */
      auth?: {
        id: string;
        role: UserRole;
        emailVerified: boolean;
      };
    }
  }
}

export {};