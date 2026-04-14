import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../SeededRNG';

describe('SeededRNG', () => {
  it('produces deterministic sequence', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);
    expect(rng1.nextFloat()).toBe(rng2.nextFloat());
  });
});
