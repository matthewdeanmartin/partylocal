import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCHEMA } from './schema';

// MfClient decodes every reply by its message name and refuses names the
// board's /api/v1/schema doesn't list (that's how the invite panel and the
// channels page once failed on a real board). Every name any UI asks for
// must be in the schema the board publishes: schema.ts is a copy of it
// (`make demo-schema`).
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(p);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

describe('the wire schema', () => {
  it('lists every message the UIs decode', () => {
    const known = new Set(SCHEMA.messages.map((m) => m.name));
    const used = new Map<string, string>();
    for (const file of sources(join(__dirname, '..', '..'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\b(?:get|send)<[^(]*\([^;]*?'([A-Z][A-Za-z]+)'\)/g)) used.set(m[1], file);
    }
    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter(([name]) => !known.has(name)).map(([name, file]) => `${name} (${file})`);
    expect(missing).toEqual([]);
  });
});
