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
    /*
     * Bound the wait for the class row lock (R2). A serverless function has a
     * hard execution limit, so an unbounded lock wait does not "eventually
     * succeed" - it burns the whole budget and the platform kills the request
     * mid-transaction, leaving the caller with no answer and the parent
     * looking at a spinner. Failing at three seconds gives the caller an
     * error it can act on while there is still time to act.
     *
     * SET LOCAL is scoped to this transaction and reset at COMMIT, so it is
     * safe under transaction-mode pgBouncer, which pins the connection for
     * the transaction's life. It is not a session-level setting (R6).
     */
    await client.query("SET LOCAL lock_timeout = '3s'");
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
