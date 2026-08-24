import React from 'react';

interface LogoIconProps {
  size?: number;
  className?: string;
}

export const LogoIcon: React.FC<LogoIconProps> = ({ size = 36, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="ArteCheck Logo Icon"
    >
      <defs>
        <linearGradient id="squircleGradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
        <linearGradient id="letterAGradient" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="checkGradient" x1="20" y1="20" x2="38" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <filter id="glowShadow" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* Modern Squircle Background */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="13"
        fill="url(#squircleGradient)"
        stroke="#334155"
        strokeWidth="1.5"
        filter="url(#glowShadow)"
      />

      {/* Stylized 'A' Geometric Glyph */}
      <path
        d="M16 34L23.5 14C23.7 13.5 24.3 13.5 24.5 14L32 34"
        stroke="url(#letterAGradient)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 27H29"
        stroke="url(#letterAGradient)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Verified Green Checkmark Emblem */}
      <circle cx="34" cy="34" r="9" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />
      <path
        d="M30 34L33 37L39 30"
        stroke="url(#checkGradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface LogoWordmarkProps {
  height?: number;
  className?: string;
}

export const LogoWordmark: React.FC<LogoWordmarkProps> = ({ height = 32, className = '' }) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <LogoIcon size={height + 6} />
      <div className="flex flex-col leading-none justify-center">
        <div className="flex items-baseline">
          <span className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
            Arte
          </span>
          <span className="text-xl sm:text-2xl font-black text-[#10B981] tracking-tight ml-0.5">
            Check
          </span>
        </div>
        <span className="text-[9px] sm:text-[10px] font-black text-[#64748B] uppercase tracking-widest mt-0.5">
          AGENTE DE IMPRESSÃO
        </span>
      </div>
    </div>
  );
};
