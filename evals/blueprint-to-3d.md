# Blueprint to 3D

Live muse-spark-1.3 review, then a Meta vision check (SAM 2.1 regions of the
drawing plus muse-spark-1.3 comparing that drawing with a captured side view).
Up to two rounds. A pass needs a sane render, at least 60% of parts located,
a last vision score of at least 3, and a green control check.

| Drawing | Pack | Parts located | Vision scores | Last score | Controls | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| US 3,402,671 Wilfley pump (public domain) | wilfley-pump | 45/55 (82%) | 2, 2 | 2 | pass | Horizontal pump. The checker still wants the bearing housing to enclose the shaft; the builder draws schematic shapes, not the patent's section. |
| Bundled centrifugal-pump blueprint | corpus-centrifugal | 8/8 (100%) | 3, 2 | 2 | pass | Vertical stack from the sheet. Round 1 scored 3; round 2 dropped to 2 because the stage stack reads as a bare shaft. |
| Bundled spindle-6203 blueprint | corpus-spindle | 7/7 (100%) | 2, 4 | 4 | pass | Passes the score bar. |
| Bundled V6 blueprint | corpus-v6 | 7/10 (70%) | 1, 1 | 1 | pass | Located, but the render flattens the V banks into one block. |
| US 3,348,430 Falk speed reducer (gearbox, public domain) | falk-speed-reducer | 18/32 (56%) | 2, 2 | 2 | pass | End view. Before the `depth` axis for end-on parts it scored 0 and 1. The vision check hid internal gears it cannot see behind the cover, which drops located parts below 60%. |
| US 3,513,339 Rotron fan motor (fan, public domain) | rotron-fan | 22/23 (96%) | 1, 2 | 2 | pass | The sheet has more than one figure, so parts from both get stacked into one machine. |
| Textless gear schematic | — | 0 | — | — | — | Review refused: circles and tick marks, no parts to build. |
| Hand sketch | — | 2 | — | — | — | Review found a chamber and a housing. Finalize requires 3 parts, so no pack was written. |
| Extreme aspect strip | — | 1 | — | — | — | One shaft diameter and no assembly. No pack was written. |

If a round lowers the score, the vision check restores the layout from before
that round's fixes. Each pack keeps its best layout, not its latest.

Only the spindle reaches the score bar of 3. Every pack that was built
passes the control check. The renders are schematic: shapes are parametric
templates placed on the drawing, not CAD.

Demo packs that already assemble (demo-pump, cr-pump, rig, v6-engine) were
left as they are. Their source manuals are not stored as a drawing the review
can re-read, and replacing them would drop the machines the control check
already passed.
