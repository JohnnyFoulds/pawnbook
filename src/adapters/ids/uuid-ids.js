/**
 * @module adapters/ids/uuid-ids
 * Production IdGenerator: delegates to crypto.randomUUID().
 */

import { randomUUID } from 'crypto';

export class UuidIds {
  /** @returns {string} */
  next() { return randomUUID(); }
}
