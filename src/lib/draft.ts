/**
 * Draft preservation utilities.
 * Stores unsaved editor drafts in sessionStorage (not localStorage) so they
 * survive refresh/navigation within the tab but are cleared when the tab closes.
 * IMPORTANT: We never log or expose draft content; we only store it locally.
 */

const DRAFT_KEY = 'textshare_draft_v1';

export interface Draft {
  title: string;
  content: string;
  language: string;
  savedAt: number;
}

export function saveDraft(draft: Draft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore – storage might be full or blocked */
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.content === 'string'
    ) {
      return parsed as Draft;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
