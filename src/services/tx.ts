import type { Pool, PoolClient } from 'pg';

/**
 * The only place BEGIN and COMMIT appear (R1.2). Transactions are a use-case
 * concern: the service layer decides what is atomic, repositories only supply
 * statements.
 *
 * One checked-out client for the whole transaction, released in finally
 * (R5.4). The failure this prevents is subtle and silent: calling pool.query
 * inside a transaction body takes a *different* connection, so the statement
 * runs outside the transaction and neither commits nor rolls back with it.
 * That is why the callback is handed a client and never the pool.
 *
 * No session-level features (R5.6) - advisory session locks and SET LOCAL
 * spanning statements do not survive a transaction-mode pooler.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Best effort: if the connection is already dead the rollback also fails,
    // and the original error is the one worth surfacing.
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the original error is rethrown below */
    }
    throw error;
  } finally {
    client.release();
  }
}
