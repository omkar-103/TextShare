import * as Diff from 'diff';
import { DiffStats, LineDiffPair, UnifiedDiffLine } from '../types';

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  granularity?: 'lines' | 'words' | 'chars';
}

export interface DiffEngineResult {
  stats: DiffStats;
  sideBySidePairs: LineDiffPair[];
  unifiedLines: UnifiedDiffLine[];
  missingFromModified: string[]; // Content present in original but deleted
  addedToModified: string[]; // Content newly introduced in modified
  isIdentical: boolean;
}

export function computeTextDiff(
  originalText: string,
  modifiedText: string,
  options: DiffOptions = {}
): DiffEngineResult {
  let orig = originalText;
  let mod = modifiedText;

  if (options.ignoreCase) {
    orig = orig.toLowerCase();
    mod = mod.toLowerCase();
  }

  // Calculate raw line changes
  const lineDiffs = Diff.diffLines(orig, mod, {
    ignoreWhitespace: options.ignoreWhitespace ?? false,
    newlineIsToken: true,
  });

  let addedLines = 0;
  let removedLines = 0;
  let unchangedLines = 0;
  const missingFromModified: string[] = [];
  const addedToModified: string[] = [];

  const unifiedLines: UnifiedDiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const part of lineDiffs) {
    const rawLines = part.value.replace(/\r\n/g, '\n').split('\n');
    // If last line is empty due to trailing newline, adjust
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
      rawLines.pop();
    }

    if (part.added) {
      addedLines += rawLines.length;
      for (const line of rawLines) {
        addedToModified.push(line);
        unifiedLines.push({
          type: 'addition',
          text: line,
          newLineNumber: newLine++,
        });
      }
    } else if (part.removed) {
      removedLines += rawLines.length;
      for (const line of rawLines) {
        missingFromModified.push(line);
        unifiedLines.push({
          type: 'deletion',
          text: line,
          oldLineNumber: oldLine++,
        });
      }
    } else {
      unchangedLines += rawLines.length;
      for (const line of rawLines) {
        unifiedLines.push({
          type: 'context',
          text: line,
          oldLineNumber: oldLine++,
          newLineNumber: newLine++,
        });
      }
    }
  }

  // Compute aligned Side-by-Side pairs
  const origLines = originalText.replace(/\r\n/g, '\n').split('\n');
  const modLines = modifiedText.replace(/\r\n/g, '\n').split('\n');

  const sideBySidePairs: LineDiffPair[] = [];
  let origIdx = 0;
  let modIdx = 0;

  for (const part of lineDiffs) {
    const lines = part.value.replace(/\r\n/g, '\n').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    if (part.removed) {
      for (const _ of lines) {
        const text = origLines[origIdx] ?? '';
        sideBySidePairs.push({
          type: 'removed',
          originalLineNumber: origIdx + 1,
          originalText: text,
          modifiedText: '',
        });
        origIdx++;
      }
    } else if (part.added) {
      for (const _ of lines) {
        const text = modLines[modIdx] ?? '';
        sideBySidePairs.push({
          type: 'added',
          modifiedLineNumber: modIdx + 1,
          originalText: '',
          modifiedText: text,
        });
        modIdx++;
      }
    } else {
      for (const _ of lines) {
        sideBySidePairs.push({
          type: 'unchanged',
          originalLineNumber: origIdx + 1,
          modifiedLineNumber: modIdx + 1,
          originalText: origLines[origIdx] ?? '',
          modifiedText: modLines[modIdx] ?? '',
        });
        origIdx++;
        modIdx++;
      }
    }
  }

  // Post-process sideBySidePairs to combine adjacent removed and added into modified rows
  const alignedPairs: LineDiffPair[] = [];
  for (let i = 0; i < sideBySidePairs.length; i++) {
    const current = sideBySidePairs[i];
    const next = sideBySidePairs[i + 1];

    if (
      current.type === 'removed' &&
      next &&
      next.type === 'added'
    ) {
      alignedPairs.push({
        type: 'modified',
        originalLineNumber: current.originalLineNumber,
        modifiedLineNumber: next.modifiedLineNumber,
        originalText: current.originalText,
        modifiedText: next.modifiedText,
      });
      i++; // skip next
    } else {
      alignedPairs.push(current);
    }
  }

  // Count modified lines
  let modifiedLines = 0;
  for (const p of alignedPairs) {
    if (p.type === 'modified') {
      modifiedLines++;
    }
  }

  // Adjusted additions/deletions after paired modifications
  const adjustedAdded = Math.max(0, addedLines - modifiedLines);
  const adjustedRemoved = Math.max(0, removedLines - modifiedLines);

  // Compute character & word counts
  const origWords = originalText.trim().length > 0 ? originalText.trim().split(/\s+/).length : 0;
  const modWords = modifiedText.trim().length > 0 ? modifiedText.trim().split(/\s+/).length : 0;

  const stats: DiffStats = {
    addedLines: adjustedAdded,
    removedLines: adjustedRemoved,
    modifiedLines,
    unchangedLines,
    charDiff: modifiedText.length - originalText.length,
    wordDiff: modWords - origWords,
  };

  const isIdentical = Boolean(
    (options.ignoreWhitespace ? originalText.trim() === modifiedText.trim() : originalText === modifiedText) ||
    (options.ignoreCase && originalText.toLowerCase() === modifiedText.toLowerCase())
  );

  return {
    stats,
    sideBySidePairs: alignedPairs,
    unifiedLines,
    missingFromModified,
    addedToModified,
    isIdentical,
  };
}

export function generatePatchString(
  originalFileName: string,
  modifiedFileName: string,
  unifiedLines: UnifiedDiffLine[]
): string {
  const timestamp = new Date().toISOString();
  let patch = `--- ${originalFileName}\t${timestamp}\n+++ ${modifiedFileName}\t${timestamp}\n@@ -1 +1 @@\n`;
  for (const line of unifiedLines) {
    if (line.type === 'addition') {
      patch += `+ ${line.text}\n`;
    } else if (line.type === 'deletion') {
      patch += `- ${line.text}\n`;
    } else {
      patch += `  ${line.text}\n`;
    }
  }
  return patch;
}
