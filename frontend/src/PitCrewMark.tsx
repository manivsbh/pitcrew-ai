import React from "react"

interface PitCrewMarkProps {
  size?: number
  className?: string
}

export const PitCrewMark: React.FC<PitCrewMarkProps> = ({ size = 24, className = "" }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pitcrew-grad-primary" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c5f292" />
          <stop offset="100%" stopColor="#67d4ff" />
        </linearGradient>
        <linearGradient id="pitcrew-grad-bolt" x1="0%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#f0b865" />
          <stop offset="50%" stopColor="#c5f292" />
          <stop offset="100%" stopColor="#67d4ff" />
        </linearGradient>
        <filter id="pitcrew-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Hexagonal Machined Perimeter (Heavy Mechanical Frame) */}
      <path
        d="M16 2.5 L27.5 9.1 L27.5 22.9 L16 29.5 L4.5 22.9 L4.5 9.1 Z"
        stroke="url(#pitcrew-grad-primary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />

      {/* Mechanical Alignment Points */}
      <circle cx="16" cy="3" r="0.75" fill="#c5f292" />
      <circle cx="27.5" cy="9.5" r="0.75" fill="#67d4ff" />
      <circle cx="27.5" cy="22.5" r="0.75" fill="#67d4ff" />
      <circle cx="16" cy="29" r="0.75" fill="#c5f292" />
      <circle cx="4.5" cy="22.5" r="0.75" fill="#c5f292" />
      <circle cx="4.5" cy="9.5" r="0.75" fill="#c5f292" />

      {/* Neural AI Orbital Ring */}
      <path
        d="M9.5 16 C9.5 12.8 12.4 10.2 16 10.2 C19.6 10.2 22.5 12.8 22.5 16 C22.5 19.2 19.6 21.8 16 21.8"
        stroke="#67d4ff"
        strokeWidth="1.1"
        strokeDasharray="1.5 2"
        opacity="0.6"
      />

      {/* High-Voltage Neural Core (Machine Brain Spark) */}
      <path
        d="M17.5 6.5 L11.5 15.5 L15.8 15.5 L14.5 25.5 L21.5 14.5 L17 14.5 Z"
        fill="url(#pitcrew-grad-bolt)"
        filter="url(#pitcrew-glow)"
      />
    </svg>
  )
}
