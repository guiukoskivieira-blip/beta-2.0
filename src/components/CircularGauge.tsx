import React from 'react';

interface CircularGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showSubtext?: boolean;
  className?: string;
  gradientId?: string;
}

export const CircularGauge: React.FC<CircularGaugeProps> = ({
  score = 0,
  size = 110,
  strokeWidth = 9,
  showSubtext = true,
  className = '',
  gradientId = 'gauge-grad',
}) => {
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  // Arc coverage (e.g. 75% to 85% of full circle or full circumference)
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00C185" />
            <stop offset="35%" stopColor="#0284C7" />
            <stop offset="70%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        {/* Track background */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated Progress Bar with Gradient */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Center Text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl sm:text-3xl font-black text-[#0F172A] tracking-tight leading-none">
          {clampedScore}
        </span>
        {showSubtext && (
          <span className="text-[11px] font-semibold text-[#64748B] mt-0.5">
            /100
          </span>
        )}
      </div>
    </div>
  );
};
