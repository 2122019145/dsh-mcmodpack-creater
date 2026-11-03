/**
 * Path helpers shared by the plugin and its scripts.
 *
 * Every default path is `~`-based or relative to this package, so a checkout
 * works from any directory on any machine (no `D:` drive assumptions).
 */

import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the plugin package root (the directory holding package.json). */
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Expand a leading `~` / `~/` / `~\`, then resolve relative paths against
 * `base` (default: the process cwd). `spawn()` does neither, so every path
 * handed to it must pass through here.
 */
export function expandPath(input, { base = process.cwd(), fallback } = {}) {
  const raw = typeof input === 'string' && input.trim() ? input.trim() : fallback;
  if (raw === undefined || raw === null) return undefined;
  if (raw === '~') return homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return resolve(homedir(), raw.slice(2));
  return isAbsolute(raw) ? raw : resolve(base, raw);
}

/**
 * Resolve a path whose relative form is meant to live inside the plugin
 * package (e.g. the HMCL-MCP jar placed next to `package.json`).
 */
export function pluginPath(input, fallback) {
  return expandPath(input, { base: PLUGIN_ROOT, fallback });
}
