/* Pure model for the rig-6203 pilot figure.
   Verified numbers come from docs-pack/excerpts/test-rig-6203-geometry.md
   (PHM paper Table 1, FAG 6203 designation data). The fault-frequency
   formula mirrors backend/app/analysis.py fault_frequencies exactly. */

// Raceways, pitch, balls, count, contact angle: verified (PHM Table 1).
// Bore / OD / width: 6203 designation standard (17 x 40 x 12).
export const GEO6203 = {
  n: 8,
  ballDia: 6.75,
  pitchDia: 28.55,
  contactDeg: 0.0,
  innerRaceDia: 24.0,
  outerRaceDia: 33.1,
  boreDia: 17,
  odDia: 40,
  widthMm: 12,
};

// Same formula as backend fault_frequencies (rotating inner ring),
// plus the cage (fundamental train) frequency that orbits the ball set.
export function faultFreq(rpm, g = GEO6203) {
  const fr = rpm / 60;
  const ratio = (g.ballDia / g.pitchDia) * Math.cos((g.contactDeg * Math.PI) / 180);
  return {
    fr,
    bpfo: (g.n / 2) * fr * (1 - ratio),
    bpfi: (g.n / 2) * fr * (1 + ratio),
    ftf: (fr / 2) * (1 - ratio),
  };
}

// Motion runs slowed so the orbit reads; the readout is always true.
export const SLOW = 30;
export const RPM_MIN = 0;
export const RPM_MAX = 3000;
export const START_RPM = 1500;
