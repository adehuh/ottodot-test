'use server';

import { z } from 'zod';

import { getPool } from '@/src/db/pool';
import {
  createBooking as createBookingService,
  confirmBooking as confirmBookingService,
  getBooking as getBookingService,
} from '@/src/services/booking';
import { listChildren, listTrialClasses as listTrialClassesService } from '@/src/services/catalog';
import type { BookingView, StudentView, TrialClassView } from '@/src/domain/dto';
import type { Result } from '@/src/domain/result';

/**
 * Thin edge (R1.3): validate with Zod, call exactly one service, hand back
 * the result. No conditional about seats or statuses lives here - if one
 * appears, it belongs in a service.
 */

const uuid = z.string().uuid();

const createSchema = z.object({ studentId: uuid, trialClassId: uuid });
const confirmSchema = z.object({
  bookingId: uuid,
  simulate: z.enum(['SUCCESS', 'DECLINE', 'SLOW']),
});

export async function listTrialClassesAction(): Promise<TrialClassView[]> {
  return listTrialClassesService(getPool());
}

export async function listChildrenAction(parentId: string): Promise<StudentView[]> {
  const parsed = uuid.safeParse(parentId);
  if (!parsed.success) return [];
  return listChildren(getPool(), parsed.data);
}

export async function createBookingAction(input: {
  studentId: string;
  trialClassId: string;
}): Promise<Result<BookingView>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  return createBookingService(getPool(), parsed.data);
}

export async function confirmBookingAction(input: {
  bookingId: string;
  simulate: 'SUCCESS' | 'DECLINE' | 'SLOW';
}): Promise<Result<BookingView>> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  return confirmBookingService(getPool(), parsed.data);
}

export async function getBookingAction(bookingId: string): Promise<Result<BookingView>> {
  const parsed = uuid.safeParse(bookingId);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  return getBookingService(getPool(), parsed.data);
}
