/**
 * NexChat — Repository Base Types
 *
 * Shared types and interfaces used by all repositories.
 *
 * The repository pattern gives us:
 *  1. A clean boundary between business logic and data access.
 *     Services import IUserRepository, not Mongoose User — so if we ever
 *     switch databases again, only the repository impl changes.
 *  2. Easy mocking in unit tests (inject a fake IUserRepository).
 *  3. A single place to enforce field exclusions (e.g. never return passwordHash).
 */

/** Pagination cursor parameters (cursor-based, not offset) */
export interface PaginationOptions {
  /** Max number of documents to return */
  limit: number;
  /** Cursor: ISO date string from the last document's sentAt / createdAt */
  before?: string;
}

/** Standard page result returned by paginated queries */
export interface PageResult<T> {
  items: T[];
  hasMore: boolean;
  total?: number;
}

/**
 * A "safe" user object — passwordHash is intentionally excluded.
 * All user queries in this app return SafeUser, never IUser directly.
 */
export type { IUser } from "../models/User.js";
export type { IMessage, MessageType } from "../models/Message.js";
export type { ISession } from "../models/Session.js";
export type { IFriend, FriendshipStatus } from "../models/Friend.js";
