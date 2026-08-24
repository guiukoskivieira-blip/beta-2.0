import React from 'react';

interface LogoIconProps {
  size?: number;
  className?: string;
}

export const LogoIcon: React.FC<LogoIconProps> = ({ size = 36, className = '' }) => {
  return (
    <img
      src="/brand/artecheck-icon.svg"
      alt="ArteCheck"
      width={size}
      height={size}
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`shrink-0 object-contain ${className}`}
      loading="eager"
    />
  );
};

interface LogoWordmarkProps {
  height?: number;
  className?: string;
}

export const LogoWordmark: React.FC<LogoWordmarkProps> = ({ height = 30, className = '' }) => {
  return (
    <div className={`flex items-center select-none ${className}`}>
      <img
        src="/brand/artecheck-central.svg"
        alt="ArteCheck - Agente de Impressão"
        style={{ height: `${height}px` }}
        className="w-auto object-contain max-w-[200px] sm:max-w-[240px]"
        loading="eager"
      />
    </div>
  );
};

