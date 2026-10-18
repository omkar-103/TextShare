import { OwnerTokenEntry } from '../types';

const STORAGE_KEY = 'textshare_owner_tokens_v1';

export function getStoredOwnerTokens(): OwnerTokenEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOwnerToken(entry: OwnerTokenEntry): void {
  try {
    const tokens = getStoredOwnerTokens();
    const existingIndex = tokens.findIndex((t) => t.shareCode === entry.shareCode);
    if (existingIndex >= 0) {
      tokens[existingIndex] = entry;
    } else {
      tokens.unshift(entry);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (err) {
    console.error('Failed to store owner token', err);
  }
}

export function getOwnerTokenForShare(shareCode: string): string | null {
  const tokens = getStoredOwnerTokens();
  const match = tokens.find((t) => t.shareCode === shareCode);
  return match ? match.ownerToken : null;
}

export function removeOwnerToken(shareCode: string): void {
  try {
    const tokens = getStoredOwnerTokens().filter((t) => t.shareCode !== shareCode);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (err) {
    console.error('Failed to remove owner token', err);
  }
}

export function exportTokensAsJson(): string {
  return JSON.stringify(getStoredOwnerTokens(), null, 2);
}

export function importTokensFromJson(jsonStr: string): boolean {
  try {
    const imported = JSON.parse(jsonStr);
    if (!Array.isArray(imported)) return false;
    const current = getStoredOwnerTokens();
    const map = new Map<string, OwnerTokenEntry>();
    for (const item of current) {
      map.set(item.shareCode, item);
    }
    for (const item of imported) {
      if (item.shareCode && item.ownerToken) {
        map.set(item.shareCode, item);
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.values())));
    return true;
  } catch {
    return false;
  }
}
