import React from 'react';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

export const TerraFiLogo = ({ size = 48, ...props }: LogoProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <defs>
      <linearGradient id="logo-hex-grad" x1="100" y1="20" x2="100" y2="180" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2563EB" /> {/* blue-600 */}
        <stop offset="1" stopColor="#7C3AED" /> {/* purple-600 */}
      </linearGradient>
      <linearGradient id="logo-leaf-grad" x1="100" y1="80" x2="100" y2="140" gradientUnits="userSpaceOnUse">
        <stop stopColor="#10B981" /> {/* green-500 */}
        <stop offset="1" stopColor="#6EE7B7" /> {/* green-300 */}
      </linearGradient>
      <linearGradient id="logo-line-grad" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#3B82F6" /> {/* blue-500 */}
        <stop offset="1" stopColor="#8B5CF6" /> {/* violet-500 */}
      </linearGradient>
    </defs>

    {/* Network Lines - The "Financial Connection" */}
    <path
      d="M173.2 50 L190 40 M195 37.5 a 5 5 0 1 1 -10 0 a 5 5 0 1 1 10 0"
      stroke="url(#logo-line-grad)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M100 20 L100 5 M100 0 a 5 5 0 1 1 0 10 a 5 5 0 1 1 0 -10"
      stroke="url(#logo-line-grad)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M26.8 50 L10 40 M5 37.5 a 5 5 0 1 1 10 0 a 5 5 0 1 1 -10 0"
      stroke="url(#logo-line-grad)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
     <path
      d="M173.2 150 L190 160 M195 162.5 a 5 5 0 1 1 -10 0 a 5 5 0 1 1 10 0"
      stroke="url(#logo-line-grad)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />

    {/* Central Hexagon */}
    <path
      d="M100 20 L173.2 50 V 150 L100 180 L26.8 150 V 50 Z"
      fill="url(#logo-hex-grad)"
      stroke="#E5E7EB" // gray-200
      strokeWidth="1"
      className="dark:stroke-gray-700 transition-colors"
    />
    
    {/* Inner Leaf / Circuit */}
    <g opacity="0.9">
        {/* Stem (circuit) */}
        <path d="M100 150 V 120" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="115" r="3" fill="white" />

        {/* Leaves */}
        <path d="M100 120 C 115 110, 120 90, 105 80" stroke="url(#logo-leaf-grad)" strokeWidth="4" strokeLinecap="round" />
        <path d="M100 120 C 85 110, 80 90, 95 80" stroke="url(#logo-leaf-grad)" strokeWidth="4" strokeLinecap="round" />
        
        <path d="M100 135 C 110 130, 115 120, 105 115" stroke="url(#logo-leaf-grad)" strokeWidth="4" strokeLinecap="round" />
        <path d="M100 135 C 90 130, 85 120, 95 115" stroke="url(#logo-leaf-grad)" strokeWidth="4" strokeLinecap="round" />
    </g>

  </svg>
);
