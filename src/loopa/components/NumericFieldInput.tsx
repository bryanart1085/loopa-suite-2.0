import React, { useEffect, useRef, useState } from 'react';

export function formatNumericValue(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0';
  const factor = Math.pow(10, Math.max(0, decimals));
  const rounded = Math.round(value * factor) / factor;
  const clean = Object.is(rounded, -0) || Math.abs(rounded) === 0 ? 0 : rounded;
  return clean.toString();
}

export function parseNumericDraft(draft: string): number | null {
  const normalized = draft.trim().replace(/,/g, '.');
  if (
    !normalized ||
    normalized === '-' ||
    normalized === '+' ||
    normalized === '.' ||
    normalized === '-.' ||
    normalized === '+.'
  ) {
    return null;
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) {
    return null;
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

interface NumericFieldInputProps {
  value: number;
  decimals?: number;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  onCommit: (nextValue: number) => void;
}

export const NumericFieldInput: React.FC<NumericFieldInputProps> = ({
  value,
  decimals = 2,
  disabled = false,
  ariaLabel,
  placeholder,
  className = '',
  onCommit,
}) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatNumericValue(value, decimals));
  const skipNextBlurRef = useRef(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatNumericValue(value, decimals));
    }
  }, [decimals, focused, value]);

  const commitDraft = () => {
    const parsed = parseNumericDraft(draft);
    if (parsed !== null) {
      onCommit(parsed);
      setDraft(formatNumericValue(parsed, decimals));
    } else {
      setDraft(formatNumericValue(value, decimals));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      onFocus={(e) => {
        setFocused(true);
        skipNextBlurRef.current = false;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={() => {
        setFocused(false);
        if (skipNextBlurRef.current) {
          skipNextBlurRef.current = false;
          return;
        }
        commitDraft();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitDraft();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          skipNextBlurRef.current = true;
          setDraft(formatNumericValue(value, decimals));
          setFocused(false);
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
};
