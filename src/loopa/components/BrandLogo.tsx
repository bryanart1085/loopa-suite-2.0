import React from 'react';
import { APP_BRAND_ASSETS, APP_NAME } from '../config/brand';

interface LoopaSymbolProps {
  size?: number;
  className?: string;
}

/**
 * Icono compacto de LOOPA: utiliza únicamente el símbolo oficial 3D
 * inspirado en la herramienta Loop Tool, sin texto miniatura.
 */
export const LoopaSymbol: React.FC<LoopaSymbolProps> = ({
  size = 32,
  className = '',
}) => (
  <img
    src={size <= 64 ? APP_BRAND_ASSETS.symbolCompact : APP_BRAND_ASSETS.symbol}
    alt={APP_NAME}
    width={size}
    height={size}
    draggable={false}
    className={`object-contain select-none shrink-0 ${className}`}
  />
);

interface LoopaWordmarkProps {
  className?: string;
}

/**
 * Palabra oficial LOOPA extraída directamente del recurso aprobado.
 */
export const LoopaWordmark: React.FC<LoopaWordmarkProps> = ({
  className = 'h-4 w-auto',
}) => (
  <img
    src={APP_BRAND_ASSETS.wordmark}
    alt={APP_NAME}
    draggable={false}
    className={`object-contain select-none shrink-0 ${className}`}
  />
);

interface LoopaFullLogoProps {
  variant?: 'vertical' | 'horizontal';
  className?: string;
}

/**
 * Logo completo oficial (símbolo Loop Tool + palabra LOOPA).
 */
export const LoopaFullLogo: React.FC<LoopaFullLogoProps> = ({
  variant = 'horizontal',
  className = '',
}) => (
  <img
    src={
      variant === 'vertical'
        ? APP_BRAND_ASSETS.fullLogo
        : APP_BRAND_ASSETS.horizontalLogo
    }
    alt={APP_NAME}
    draggable={false}
    className={`object-contain select-none shrink-0 ${className}`}
  />
);
