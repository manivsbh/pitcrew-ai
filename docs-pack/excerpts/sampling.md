# Sampling rates (verified excerpt)

Source: PHM paper (data acquisition section)
https://papers.phmsociety.org/index.php/phme/article/download/1577/542

- The two main signals (motor current, vibration) are digitised at 64 kHz.
- Support signals (speed, torque, force, temperature) use lower rates.

Observed from the files themselves (not doc-stated, recorded here as
implementation rule):

- Each channel carries an explicit time vector; the sampling rate is derived
  per channel as (n-1)/(t_last-t_first) and sanity-checked against nominal
  (64 kHz fast channels, 4 kHz slow "Mech_4kHz" channels).
- A deviation over 1% from nominal is recorded as a quality finding, and the
  derived (measured) rate is used for all spectral math.
- Channel unit fields in the .mat files are empty; the vibration unit is
  therefore treated as unknown acceleration. No unit conversion is applied
  to measured data without a documented unit.
