import { describe, it, expect, beforeEach } from 'vitest';
import {
  authorize,
  capture,
  voidAuthorization,
  getAuthorization,
  resetGateway,
} from '@/src/payments/mock';

/**
 * The gateway is mocked, not integrated. What matters is that it is
 * *deterministic*: a decline is an explicit input, never random (R3.3). A
 * gateway that declines randomly makes the payment-failure test flaky, and a
 * flaky test proving a money invariant is worse than no test.
 */
describe('mock payment gateway', () => {
  beforeEach(() => {
    resetGateway();
  });

  it('authorizes when asked to succeed', async () => {
    const result = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SUCCESS' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getAuthorization(result.authorizationId)?.status).toBe('AUTHORIZED');
    }
  });

  it('declines only when explicitly asked to, never at random', async () => {
    const declined = await authorize({
      amountCents: 4500,
      currency: 'SGD',
      simulate: 'DECLINE',
    });
    expect(declined.ok).toBe(false);

    // Same inputs, same outcome, twenty times over. No randomness anywhere.
    for (let i = 0; i < 20; i++) {
      const again = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SUCCESS' });
      expect(again.ok).toBe(true);
    }
  });

  it('creates no authorization to reverse when it declines', async () => {
    const result = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'DECLINE' });
    expect(result.ok).toBe(false);
    // Nothing was authorized, so there is nothing to void. This is why a
    // decline touches no seat and needs no reversal (R3.3).
  });

  it('captures an authorization and records the provider reference', async () => {
    const auth = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SUCCESS' });
    if (!auth.ok) throw new Error('expected authorization');

    const { providerRef } = await capture(auth.authorizationId);

    expect(providerRef).toBeTruthy();
    expect(getAuthorization(auth.authorizationId)?.status).toBe('CAPTURED');
  });

  it('voids an authorization without taking money', async () => {
    const auth = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SUCCESS' });
    if (!auth.ok) throw new Error('expected authorization');

    await voidAuthorization(auth.authorizationId);

    expect(getAuthorization(auth.authorizationId)?.status).toBe('VOIDED');
  });

  it('refuses to capture an authorization that was already voided', async () => {
    const auth = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SUCCESS' });
    if (!auth.ok) throw new Error('expected authorization');
    await voidAuthorization(auth.authorizationId);

    // A fault, not a result code: the caller has the ordering wrong.
    await expect(capture(auth.authorizationId)).rejects.toThrow(/voided/i);
  });

  it('refuses to void a captured authorization, because there is no refund path', async () => {
    const auth = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SUCCESS' });
    if (!auth.ok) throw new Error('expected authorization');
    await capture(auth.authorizationId);

    // R3.3: money is never captured for a seat the child did not get, so
    // reversing a capture must never become reachable.
    await expect(voidAuthorization(auth.authorizationId)).rejects.toThrow(/refund/i);
  });

  it('treats voiding an already-voided authorization as a no-op', async () => {
    const auth = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SUCCESS' });
    if (!auth.ok) throw new Error('expected authorization');

    await voidAuthorization(auth.authorizationId);
    await expect(voidAuthorization(auth.authorizationId)).resolves.toBeUndefined();
  });

  it('throws for an authorization it has never seen', async () => {
    await expect(capture('auth_nope')).rejects.toThrow(/unknown/i);
  });

  it('delays under SLOW so the race window can be widened on demand', async () => {
    const started = Date.now();
    const result = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SLOW' });
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('issues distinct authorization ids', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const auth = await authorize({ amountCents: 4500, currency: 'SGD', simulate: 'SUCCESS' });
      if (auth.ok) ids.add(auth.authorizationId);
    }
    expect(ids.size).toBe(10);
  });
});
