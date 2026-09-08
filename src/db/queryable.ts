import type { Pool, PoolClient } from 'pg';

/**
 * Every repository takes a Queryable rather than reaching for the pool.
 *
 * Inside a transaction the service passes its checked-out client, so the
 * statement runs *in* that transaction. Passing the pool there would take a
 * different connection and silently run outside it (R5.4). Making the caller
 * supply the connection is what stops that mistake being available.
 */
export type Queryable = Pool | PoolClient;
