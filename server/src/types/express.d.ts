import type { Types } from 'mongoose';
import type { UserRole } from './roles.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by `requireAuth`. Present on routes mounted after that middleware.
       */
      userId?: string;
      clerkId?:string;

      /** Set by `requireAuth` alongside `userId`. */
      userObjectId?: Types.ObjectId;

      /** JWT-derived payload (`id` matches `userId`). Set by `requireAuth`. */
      auth?: {
        id: string;
        role: UserRole;
        emailVerified: boolean;
      };

      /** Verified Clerk session — set by `requireClerkSession`. */
      clerkSession?: {
        clerkId: string;
        email: string;
        fullName: string;
        profileImage: string;
      };
    }
  }
}

export {};