# Test bearing 6203 geometry (verified excerpt)

Sources:

- PHM paper, Table 1 (bearing damage categorization, FAG 6203)
  https://papers.phmsociety.org/index.php/phme/article/download/1577/542
- Bearing DataCenter, "Test rig and measurement equipment"
  https://mb.uni-paderborn.de/en/kat/research/bearing-datacenter/test-rig-and-measurement-equipment
- Bearing DataCenter, "Data Sets and Download" (all 32 states are 6203)

Verified dimensions (Table 1):

- Inner raceway diameter: 24.0 mm
- Outer raceway diameter: 33.1 mm
- Pitch circle diameter: 28.55 mm
- Rolling elements: 8, diameter 6.75 mm, length 6.75 mm
- Nominal pressure angle: 0 degrees

Cross-manufacturer note (paper, section 3): test bearings come from FAG, MTK
and IBU/IBB; all have eight rolling elements and near-identical sizes, so
characteristic kinematic frequencies vary no more than 1-2%. Frequency
matching therefore uses a +/-2% tolerance window.

Measurement context: main variables are drive-motor stator current and
housing vibration (acceleration) at the bearing housing. Vibration sensor
PCB Piezotronics 336C04; charging amplifier type 5015 with 30 kHz 2nd-order
filter.
