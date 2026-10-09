import { describe, expect, it } from 'vitest';
import { createDb } from './client';

describe('db client', () => {
  it('is null when DATABASE_URL is unset', () => {
    expect(createDb(undefined)).toBeNull();
    expect(createDb('')).toBeNull();
  });

  it('creates a client without connecting when a URL is given', () => {
    expect(createDb('postgres://user:pass@localhost:5432/rivetrun')).not.toBeNull();
  });
});
