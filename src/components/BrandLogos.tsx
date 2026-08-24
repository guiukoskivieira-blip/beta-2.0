import React from 'react';

/**
 * LogoIcon: Modern rounded squircle with the ArteCheck 'A' symbol and gradient checkmark
 */
export const LogoIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 44 }) => {
  return (
    <div 
      className={`relative flex items-center justify-center rounded-2xl bg-[#0F172A] shadow-md overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <svg 
        viewBox="0 0 1050 1050" 
        className="w-[82%] h-[82%]"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="icon-grad-arch" x1="58.94" y1="976.64" x2="916.79" y2="290.31" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4537DA"/>
            <stop offset="100%" stopColor="#7C3AED"/>
          </linearGradient>
          <linearGradient id="icon-grad-foot" x1="1000" y1="1050" x2="750" y2="650" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F43F5E"/>
            <stop offset="100%" stopColor="#8B5CF6"/>
          </linearGradient>
        </defs>
        <g id="Symbol">
          {/* Left Arch */}
          <path 
            fill="url(#icon-grad-arch)" 
            d="M509.6 0.15c1.09,0.44 9.48,1.04 25.08,1.86 57.07,2.9 115.41,40.53 148.82,83.04 11.12,14.19 23.39,38.29 36.92,72.41 7.5,18.95 36.64,93.88 87.36,224.79 3.78,9.7 4.05,17.42 0.88,23.17 -18.95,34.56 -56.25,91.91 -102.37,93.44 -26.57,0.88 -49.4,-6.74 -68.41,-22.79 -7.39,-6.19 -13.75,-16.21 -19.17,-29.96 -25.58,-64.85 -41.68,-112.78 -65.24,-162.84 -25.14,-53.51 -70.6,-47.82 -91.09,4.6 -31.06,79.37 -65.34,170.13 -102.81,272.33 -89.66,244.67 -141.7,385.38 -156.1,422.25 -20.87,53.46 -60.52,76.46 -119.02,69.07 -38.18,-4.82 -63.86,-23.72 -77.01,-56.75 -10.24,-25.69 -9.91,-53.35 0.99,-82.87 19.22,-52.03 38.4,-103.8 57.62,-155.34 5.42,-14.52 55.38,-145.81 149.86,-393.87 30.62,-80.46 58.11,-152.27 82.38,-215.48 23.72,-61.84 63.37,-105.44 119.08,-130.69 23.55,-10.68 50.56,-14.57 76.68,-15.23 6.08,-0.16 9.53,-0.33 10.35,-0.6 2.36,-0.66 4.33,-0.88 5.2,-0.55z"
          />
          {/* Right Foot */}
          <path 
            fill="url(#icon-grad-foot)" 
            d="M898.46 630.03c13.55,36.04 44.82,117.88 103.62,273.85 7.72,20.49 8.05,42.83 0.99,67.1 -9.53,32.48 -34.01,52.36 -65.73,60.96 -14.68,3.94 -48.58,3.12 -65.02,-2.9 -25.9,-9.41 -50.36,-38.13 -63.56,-63.68 -2.5,-4.84 -45.87,-119.36 -52.47,-145.33 0,0 141.57,-190.32 142.16,-190z"
          />
          {/* Checkmark */}
          <path 
            fill="#00C185" 
            d="M741.71 796.58c-38.4,50.68 -76.61,101.05 -114.61,151.07 -31.61,41.63 -83.8,48.15 -128,23.28 -10.02,-5.7 -21.47,-16.65 -34.29,-32.81 -14.9,-18.9 -53.13,-66.77 -114.69,-143.67 -1.7,-2.14 -3.12,-4.49 -4.16,-7.01 -17.91,-41.9 -5.48,-102.86 42.12,-118.42 20.7,-6.74 39.66,-2.57 56.91,12.49 26.46,23.06 53.57,50.45 81.34,82.11 6.3,7.17 13.25,11.94 20.87,14.3 6.52,2.03 13.64,0.06 18.24,-4.98l28.43 -31c66.77,-75.92 133.87,-150.35 201.29,-223.36 54.06,-58.55 101.38,-111.19 141.97,-157.86 13.09,-15.06 37.41,-15.55 54.66,-12.54 9.35,3.32 14.85,7.38 18.62,13.59 3.77,6.2 3.71,5.33 6.53,13.03 9.92,18.74 -4.63,64.82 -6.54,70.27 -4.66,7.31 -8.98,10.83 -9.14,11.06 -8.8,12.22 -17.58,22.41 -25.19,32.54l-234.35 307.93z"
          />
        </g>
      </svg>
    </div>
  );
};

/**
 * LogoWordmark: Complete brand wordmark for the header center
 */
export const LogoWordmark: React.FC<{ className?: string; height?: number }> = ({ className = '', height = 34 }) => {
  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <div className="flex items-baseline font-bold tracking-tight" style={{ fontSize: height * 0.75, lineHeight: 1 }}>
        <span className="text-[#0F172A] font-extrabold tracking-[-0.03em]">Arte</span>
        <span className="text-[#6366F1] font-black tracking-[-0.03em]">Check</span>
      </div>
      <span 
        className="text-[9px] font-semibold text-[#64748B] tracking-[0.22em] uppercase mt-1"
        style={{ letterSpacing: '0.22em' }}
      >
        AGENTE DE IMPRESSÃO
      </span>
    </div>
  );
};
