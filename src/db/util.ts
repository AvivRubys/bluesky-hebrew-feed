import { sql } from 'kysely';
import { OrderByDirection } from 'kysely/dist/cjs/parser/order-by-parser';

// https://github.com/kysely-org/kysely/issues/714#issuecomment-1855597072
export const orderNullsLast = (direction: OrderByDirection) =>
  sql`${sql.raw(direction)} nulls last`;
