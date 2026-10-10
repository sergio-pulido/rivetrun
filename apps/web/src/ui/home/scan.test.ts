import { describe, expect, it } from 'vitest';
import { playQrUrl, shownAddress } from './scan';

describe('playQrUrl', () => {
  it('points at /play on the public address', () => {
    expect(playQrUrl('https://quiet-river.trycloudflare.com')).toBe('https://quiet-river.trycloudflare.com/play');
    expect(playQrUrl('https://rivetrun.example.com/')).toBe('https://rivetrun.example.com/play');
    expect(playQrUrl('http://192.168.1.40:3000')).toBe('http://192.168.1.40:3000/play');
  });

  it('is never this machine', () => {
    expect(playQrUrl('http://localhost:3000')).toBeNull();
    expect(playQrUrl('http://127.0.0.1:3000')).toBeNull();
    expect(playQrUrl('http://[::1]:3000')).toBeNull();
    expect(playQrUrl('http://app.localhost:3000')).toBeNull();
    expect(playQrUrl('http://0.0.0.0:3000')).toBeNull();
  });

  it('is nothing when no address is known', () => {
    expect(playQrUrl('')).toBeNull();
    expect(playQrUrl(null)).toBeNull();
    expect(playQrUrl('not a url')).toBeNull();
    expect(playQrUrl('ftp://files.example.com')).toBeNull();
  });

  it('shows the address without its protocol', () => {
    expect(shownAddress('https://quiet-river.trycloudflare.com/play')).toBe('quiet-river.trycloudflare.com/play');
  });
});
