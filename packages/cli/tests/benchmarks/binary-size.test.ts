import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const BINARY_PATH = resolve(process.cwd(), 'dist/cia');
const MAX_SIZE_BYTES = Number(process.env.MAX_SIZE_BYTES ?? '125829120');

describe('binary-size-benchmark', () => {
  it('keeps compiled binary under configured size budget', () => {
    expect(existsSync(BINARY_PATH)).toBe(true);

    const sizeBytes = statSync(BINARY_PATH).size;
    expect(sizeBytes).toBeGreaterThan(0);
    expect(sizeBytes).toBeLessThanOrEqual(MAX_SIZE_BYTES);
  });
});
