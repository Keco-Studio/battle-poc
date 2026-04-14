// ============================================================
// Result<T, E> — shared error-returning type (constitution §Error Handling)
// ============================================================

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ============================================================
// Serialized state shape — exchanged by serialize()/deserialize()
// ============================================================

export interface SerializedRNG {
  seed: number;
  state: number;
  streams: Record<string, number>;
}

// ============================================================
// IRNGStream — public interface for a named sub-stream
// ============================================================

export interface IRNGStream {
  readonly name: string;
  next(): number;
  nextInt(min: number, max: number): number;
}

// ============================================================
// Mulberry32 — single step: advances state, returns [0, 1)
// ============================================================

function mulberry32Step(state: number): { next: number; state: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
  const next = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { next, state: (state + 0x6d2b79f5) >>> 0 };
}

// ============================================================
// djb2 hash — derive stream seed from name
// ============================================================

function djb2Hash(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

// ============================================================
// RNGStream — independent named sub-stream
// ============================================================

class RNGStream implements IRNGStream {
  readonly name: string;
  private _state: number;

  constructor(name: string, initialState: number) {
    this.name = name;
    this._state = initialState >>> 0;
  }

  next(): number {
    const { next, state } = mulberry32Step(this._state);
    this._state = state;
    return next;
  }

  nextInt(min: number, max: number): number {
    if (min === max) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  getState(): number {
    return this._state;
  }

  setState(state: number): void {
    this._state = state >>> 0;
  }
}

// ============================================================
// SeededRNG — main class
// ============================================================

export class SeededRNG {
  private readonly _seed: number;
  private _state: number;
  private readonly _streams: Map<string, RNGStream>;

  constructor(seed: number) {
    this._seed = seed >>> 0;
    this._state = this._seed;
    this._streams = new Map();
  }

  // ----------------------------------------------------------
  // Root stream operations
  // ----------------------------------------------------------

  nextFloat(): number {
    const { next, state } = mulberry32Step(this._state);
    this._state = state;
    return next;
  }

  nextInt(min: number, max: number): number {
    if (min === max) return min;
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }

  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // ----------------------------------------------------------
  // Named streams
  // ----------------------------------------------------------

  stream(name: string): IRNGStream {
    if (!this._streams.has(name)) {
      const streamSeed = (djb2Hash(name) ^ this._seed) >>> 0;
      this._streams.set(name, new RNGStream(name, streamSeed));
    }
    return this._streams.get(name)!;
  }

  // ----------------------------------------------------------
  // Serialization
  // ----------------------------------------------------------

  serialize(): string {
    const streams: Record<string, number> = {};
    this._streams.forEach((stream, name) => {
      streams[name] = stream.getState();
    });
    const data: SerializedRNG = {
      seed: this._seed,
      state: this._state,
      streams,
    };
    return JSON.stringify(data);
  }

  deserialize(json: string): Result<void, Error> {
    try {
      const data: SerializedRNG = JSON.parse(json);
      if (
        typeof data.seed !== 'number' ||
        typeof data.state !== 'number' ||
        typeof data.streams !== 'object' ||
        data.streams === null
      ) {
        return { ok: false, error: new Error('Invalid RNG state: missing required fields') };
      }
      // Restore root state
      this._state = data.state >>> 0;
      // Restore streams
      this._streams.clear();
      for (const [name, state] of Object.entries(data.streams)) {
        const s = new RNGStream(name, 0);
        s.setState(state);
        this._streams.set(name, s);
      }
      return { ok: true, value: undefined };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }
}
