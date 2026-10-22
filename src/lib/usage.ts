// How much of the Host storage the Module uses, counted as the Host counts it (CONVENTION.md §6.1, ADR 0006): the sum,
// over all its keys, of the UTF-8 bytes of the key and of its value as JSON, out of 5 MB.

const MB = 1024 * 1024;

/** The most a Module may store. */
export const QUOTA = 5 * MB;

/** Past this part of the quota, the gauge alerts the User. */
export const ALERT = 0.8;

const encoder = new TextEncoder();
const bytesOf = (text: string) => encoder.encode(text).byteLength;

/** What an entry costs against the quota. */
export const entryBytes = (key: string, value: unknown): number => bytesOf(key) + bytesOf(JSON.stringify(value));

export interface StorageUsage {
  /** Starts over from every entry stored. */
  reset(entries: ReadonlyMap<string, unknown>): void;
  /** Counts a value written. */
  set(key: string, value: unknown): void;
  /** Counts a key removed. */
  delete(key: string): void;
  /** Whether the key is stored. */
  has(key: string): boolean;
  /** The bytes used, out of `QUOTA`. */
  total(): number;
  /** Whether writing this value under this key, and `reserve` bytes more, keeps the storage within the quota. */
  fits(key: string, value: unknown, reserve?: number): boolean;
  /** Whether writing all these entries keeps the storage within the quota. */
  fitsAll(entries: Iterable<readonly [string, unknown]>): boolean;
}

/** The usage of the storage, kept up to date by each write and deletion rather than read again. */
export function storageUsage(): StorageUsage {
  const sizes = new Map<string, number>();
  const total = () => [...sizes.values()].reduce((sum, size) => sum + size, 0);
  return {
    reset(entries) {
      sizes.clear();
      for (const [key, value] of entries) sizes.set(key, entryBytes(key, value));
    },
    set: (key, value) => void sizes.set(key, entryBytes(key, value)),
    delete: (key) => void sizes.delete(key),
    has: (key) => sizes.has(key),
    total,
    fits: (key, value, reserve = 0) => total() - (sizes.get(key) ?? 0) + entryBytes(key, value) + reserve <= QUOTA,
    fitsAll: (entries) => total() + [...entries].reduce((sum, [key, value]) => sum + entryBytes(key, value) - (sizes.get(key) ?? 0), 0) <= QUOTA,
  };
}

/** The gauge: "x.x MB / 5 MB", and whether it alerts. */
export const usageText = (bytes: number): { text: string; alert: boolean } => ({
  text: `${(bytes / MB).toFixed(1)} MB / ${QUOTA / MB} MB`,
  alert: bytes > QUOTA * ALERT,
});
