import React from "react"

interface PitCrewMarkProps {
  size?: number
  className?: string
  /** Ring color; the lit (faulty) ball always uses the accent. */
  color?: string
  accent?: string
}

/** "Lit Bearing": a 6203 bearing face-on with the one damaged ball found. */
export const PitCrewMark: React.FC<PitCrewMarkProps> = ({
  size = 24,
  className = "",
  color = "#e6eeec",
  accent = "#c5f292",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <circle cx="32" cy="32" r="27" stroke={color} strokeWidth="4.5" />
    <circle cx="32" cy="32" r="11" stroke={color} strokeWidth="4.5" />
    <g fill={color} opacity="0.55">
      <circle cx="32" cy="13" r="4.2" />
      <circle cx="48.5" cy="22.5" r="4.2" />
      <circle cx="48.5" cy="41.5" r="4.2" />
      <circle cx="32" cy="51" r="4.2" />
      <circle cx="15.5" cy="41.5" r="4.2" />
    </g>
    <circle cx="15.5" cy="22.5" r="5.4" fill={accent} />
    <circle cx="15.5" cy="22.5" r="9" stroke={accent} strokeWidth="1.6" opacity="0.55" />
  </svg>
)
