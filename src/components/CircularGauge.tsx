import React from 'react';

interface CircularGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showScoreText?: boolean;
  className?: string;
}

export const CircularGauge: React.FC<CircularGaugeProps> = ({
  score,
  size = 88,
  strokeWidth = 8,
  showScoreText = true,
  className = '',
}) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  // Unique gradient ID per instance
  const gradientId = `gaugeGrad_${size}_${Math.round(score)}`;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00C185" />
            <stop offset="35%" stopColor="#0284C7" />
            <stop offset="70%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Animated Progress Stroke */}
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
          className="transition-all duration-1000 ease-out"
        />
      </svg>

      {/* Center Numerical Score Display */}
      {showScoreText && (
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none select-none">
          <span className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tighter">
            {clampedScore}
          </span>
          <span className="text-[9px] font-bold text-[#94A3B8] uppercase mt-0.5">
            / 100
          </span>
        </div>
      )}
    </div>
  );
};
