/**
 * NexChat — Repository Barrel Export
 *
 * Single import point for all repository functions.
 * Business logic (services, controllers) imports from here, not from
 * individual repository files — this keeps the dependency graph clean.
 *
 * @example
 * import { findUserById, createMessage } from "../repositories/index.js";
 */

export * from "./user.repository.js";
export * from "./message.repository.js";
export * from "./session.repository.js";
export * from "./friend.repository.js";
export type { PaginationOptions, PageResult } from "./types.js";
