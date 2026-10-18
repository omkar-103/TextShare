export type PermissionMode = 'view' | 'edit';

export interface SharedDocument {
  id: string;
  shareCode: string;
  title: string;
  content: string;
  permissionMode: PermissionMode;
  language: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  revokedAt?: number | null;
  contentVersion: number;
  viewCount: number;
  isOwner?: boolean;
  canEdit?: boolean;
  isPasswordProtected?: boolean;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  content: string;
  title: string;
  changeSummary: string | null;
  actorName: string | null;
  createdAt: number;
}

export interface Participant {
  clientId: string;
  clientName: string;
  color: string;
  isOwner: boolean;
  canEdit: boolean;
  cursor?: { line: number; ch: number };
  selection?: { from: { line: number; ch: number }; to: { line: number; ch: number } };
  joinedAt: number;
}

export interface OwnerTokenEntry {
  shareCode: string;
  ownerToken: string;
  title: string;
  createdAt: number;
}

export interface DiffStats {
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
  unchangedLines: number;
  charDiff: number;
  wordDiff: number;
}

export interface LineDiffPair {
  type: 'added' | 'removed' | 'modified' | 'unchanged' | 'empty';
  originalLineNumber?: number;
  modifiedLineNumber?: number;
  originalText?: string;
  modifiedText?: string;
}

export interface UnifiedDiffLine {
  type: 'addition' | 'deletion' | 'context' | 'header';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}
