import React, { useRef, useState } from 'react';
import {
  Copy,
  Check,
  Trash2,
  WrapText,
  Hash,
  Eye,
  Edit3,
} from 'lucide-react';

interface EditorProps {
  value: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: string;
  showLineNumbers?: boolean;
  onCursorChange?: (cursor: { line: number; ch: number }) => void;
  language?: string;
  onClearConfirm?: () => void;
}

export const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  readOnly = false,
  placeholder = 'Paste or type text, source code, JSON, logs, or notes here…',
  minHeight = '360px',
  showLineNumbers = true,
  onCursorChange,
  language = 'plaintext',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [lineNumbersVisible, setLineNumbersVisible] = useState(showLineNumbers);
  const [showClearModal, setShowClearModal] = useState(false);

  const lineCount = value.length > 0 ? value.split('\n').length : 1;
  const wordCount = value.trim().length > 0 ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (textareaRef.current) {
        textareaRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      if (onChange) onChange(newValue);
      requestAnimationFrame(() => {
        if (target) target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  const handleSelectOrKeyUp = () => {
    if (!onCursorChange || !textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const textBefore = value.substring(0, pos);
    const lines = textBefore.split('\n');
    onCursorChange({ line: lines.length, ch: lines[lines.length - 1].length });
  };

  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div
      className="relative flex flex-col rounded-lg border overflow-hidden font-mono text-sm"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center justify-between border-b px-3 py-2 text-xs"
        style={{
          backgroundColor: 'var(--color-surface-raised)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <div className="flex items-center gap-2">
          {readOnly ? (
            <span
              className="flex items-center gap-1 rounded px-2 py-0.5 font-medium"
              style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}
            >
              <Eye className="h-3 w-3" aria-hidden="true" />
              View Only
            </span>
          ) : (
            <span
              className="flex items-center gap-1 rounded px-2 py-0.5 font-medium"
              style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}
            >
              <Edit3 className="h-3 w-3" aria-hidden="true" />
              Editable
            </span>
          )}
          <span
            className="rounded px-2 py-0.5 uppercase font-semibold text-[10px]"
            style={{ backgroundColor: 'var(--color-surface-sunken)', color: 'var(--color-text-secondary)' }}
          >
            {language}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLineNumbersVisible(!lineNumbersVisible)}
            aria-label="Toggle line numbers"
            aria-pressed={lineNumbersVisible}
            className="flex items-center gap-1 rounded px-2 py-1 transition-colors"
            style={{
              color: lineNumbersVisible ? 'var(--color-accent)' : 'var(--color-text-muted)',
            }}
          >
            <Hash className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Lines</span>
          </button>

          <button
            type="button"
            onClick={() => setWrap(!wrap)}
            aria-label="Toggle line wrapping"
            aria-pressed={wrap}
            className="flex items-center gap-1 rounded px-2 py-1 transition-colors"
            style={{
              color: wrap ? 'var(--color-accent)' : 'var(--color-text-muted)',
            }}
          >
            <WrapText className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Wrap</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 transition-colors"
            aria-label="Copy all text"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                <span style={{ color: 'var(--color-success)' }}>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>

          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                if (value.trim().length > 0) setShowClearModal(true);
              }}
              disabled={value.length === 0}
              className="flex items-center gap-1 rounded px-2 py-1 transition-colors disabled:opacity-40"
              style={{ color: 'var(--color-danger)' }}
              aria-label="Clear editor"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor body */}
      <div className="flex relative flex-1" style={{ minHeight }}>
        {/* Line numbers */}
        {lineNumbersVisible && (
          <div
            aria-hidden="true"
            className="select-none border-r px-3 py-3 text-right text-xs font-mono"
            style={{
              minWidth: '3.5rem',
              backgroundColor: 'var(--color-surface-raised)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            {lineNumbers.map((num) => (
              <div key={num} className="leading-6">{num}</div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={handleSelectOrKeyUp}
          onClick={handleSelectOrKeyUp}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          className={`flex-1 resize-none bg-transparent p-3 outline-none leading-6 ${
            wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
          } ${readOnly ? 'cursor-default select-text' : ''}`}
          style={{
            minHeight,
            color: 'var(--color-text-primary)',
            caretColor: 'var(--color-accent)',
          }}
          aria-label={readOnly ? 'Read-only text content' : 'Text editor'}
        />
      </div>

      {/* Footer status bar */}
      <div
        className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] font-sans"
        style={{
          backgroundColor: 'var(--color-surface-raised)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
      >
        <div className="flex items-center gap-4">
          <span>{lineCount} lines</span>
          <span>{wordCount.toLocaleString()} words</span>
          <span>{charCount.toLocaleString()} chars</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span>UTF-8</span>
          <span>•</span>
          <span>{wrap ? 'Wrapped' : 'No Wrap'}</span>
        </div>
      </div>

      {/* Clear confirmation */}
      {showClearModal && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgb(0 0 0 / 0.4)', backdropFilter: 'blur(2px)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-title"
        >
          <div
            className="w-full max-w-sm rounded-lg border p-5 font-sans"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h3
              id="clear-title"
              className="font-semibold text-base"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Clear Editor Content?
            </h3>
            <p className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Are you sure you want to clear all {charCount.toLocaleString()} characters? Unsaved text will be permanently lost.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onChange) onChange('');
                  setShowClearModal(false);
                }}
                className="btn btn-danger btn-sm"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
