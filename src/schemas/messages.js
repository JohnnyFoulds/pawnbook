/**
 * @module schemas/messages
 * Zod schemas for WebSocket message payloads (in and out).
 */
import { z } from 'zod';

export const TimeControlSchema = z.object({
  initialSec: z.number().int().positive(),
  incSec: z.number().int().min(0),
}).nullable();

export const NewGameMessageSchema = z.object({
  type: z.literal('new_game'),
  opponentId: z.string().min(1),
  color: z.enum(['white', 'black', 'random']),
  ranked: z.boolean().default(true),
  timeControl: TimeControlSchema.optional().default(null),
  coachEnabled: z.boolean().optional().default(true),
});

export const MoveMessageSchema = z.object({
  type: z.literal('move'),
  uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
});

export const ResignMessageSchema = z.object({
  type: z.literal('resign'),
});

export const HintMessageSchema = z.object({
  type: z.literal('hint'),
});

export const ResumeMessageSchema = z.object({
  type: z.literal('resume'),
  gameId: z.string().uuid(),
});

export const RepertoireChoiceMessageSchema = z.object({
  type: z.literal('repertoire_choice'),
  choice: z.enum(['correct', 'keep']),
}).strict();

export const InboundMessageSchema = z.discriminatedUnion('type', [
  NewGameMessageSchema,
  MoveMessageSchema,
  ResignMessageSchema,
  HintMessageSchema,
  ResumeMessageSchema,
  RepertoireChoiceMessageSchema,
]);
