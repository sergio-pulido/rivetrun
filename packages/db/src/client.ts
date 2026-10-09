import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Db = NeonHttpDatabase<typeof schema>;

/** Returns null when no connection string is given: the game must work without a database. */
export function createDb(databaseUrl: string | undefined): Db | null {
  if (!databaseUrl) return null;
  return drizzle(neon(databaseUrl), { schema });
}

/** null when DATABASE_URL is unset. */
export const db: Db | null = createDb(process.env.DATABASE_URL);
