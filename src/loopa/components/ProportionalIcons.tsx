import React from 'react';
import type { ProportionalFalloff } from '../core/mesh/proportionalEditing';

export const FalloffCurveIcon: React.FC<{
  falloff: ProportionalFalloff;
  className?: string;
}> = ({ falloff, className = 'w-4 h-3.5' }) => {
  let d = 'M2 13 C6 13, 8 3, 12 3 C16 3, 18 13, 22 13';
  switch (falloff) {
    case 'smooth':
      d = 'M2 13 C6 13, 8 3, 12 3 C16 3, 18 13, 22 13';
      break;
    case 'sphere':
      d = 'M2 13 A10 10 0 0 1 22 13';
      break;
    case 'root':
      d = 'M2 13 Q5 4 12 3 Q19 4 22 13';
      break;
    case 'sharp':
      d = 'M2 13 Q9 12 12 3 Q15 12 22 13';
      break;
    case 'linear':
      d = 'M2 13 L12 3 L22 13';
      break;
    case 'constant':
      d = 'M2 13 L5 13 L5 3 L19 3 L19 13 L22 13';
      break;
  }
  return (
    <svg
      viewBox="0 0 24 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
};

export const ProportionalIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" strokeDasharray="3 2.5" opacity="0.72" />
    <path d="M5 17c2.4 0 3.7-9 7-9s4.6 9 7 9" />
    <circle cx="12" cy="8" r="1.7" fill="currentColor" stroke="none" />
  </svg>
);
