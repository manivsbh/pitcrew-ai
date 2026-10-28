"""Author the V6 demo service-parts PDF (git-ignored output, reproducible input).

Writes data/manuals/v6-service-parts.pdf: a 26-part torque table + removal
sentences that the pack-builder onboards as the v6-engine demo machine.
Run: .venv/bin/python scripts/make_v6_demo_pdf.py
Then onboard via the pack-builder API (draft -> answer -> finalize).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests"))

from test_packbuilder import make_pdf  # noqa: E402

TORQUE = [
    (1, "Crankcase", "40 Nm"), (2, "Oil Pan", "12 Nm"),
    (3, "Crankshaft", "90 Nm"), (4, "Flywheel", "65 Nm"),
    (5, "Connecting Rods", "45 Nm"), (6, "Cylinder Bank L", "30 Nm"),
    (7, "Cylinder Bank R", "30 Nm"), (8, "Camshaft L", "22 Nm"),
    (9, "Camshaft R", "22 Nm"), (10, "Intake Manifold", "18 Nm"),
    (11, "Fuel Pump", "15 Nm"), (12, "Fuel Rail L", "10 Nm"),
    (13, "Fuel Rail R", "10 Nm"), (14, "Spark Plugs", "25 Nm"),
    (15, "Piston 1", "0 Nm"), (16, "Piston 2", "0 Nm"),
    (17, "Piston 3", "0 Nm"), (18, "Piston 4", "0 Nm"),
    (19, "Piston 5", "0 Nm"), (20, "Piston 6", "0 Nm"),
    (21, "Fuel Injector 1", "8 Nm"), (22, "Fuel Injector 2", "8 Nm"),
    (23, "Fuel Injector 3", "8 Nm"), (24, "Fuel Injector 4", "8 Nm"),
    (25, "Fuel Injector 5", "8 Nm"), (26, "Fuel Injector 6", "8 Nm"),
]
LINES = [
    "V6 COMBUSTION ENGINE - Service Parts List",
    "Model V6-DEMO. Exploded view and parts list follow.",
    "",
    "Torque table (fastener torque in Nm):",
]
LINES += [f"{pos} {name} ............. {tq}" for pos, name, tq in TORQUE]
LINES += [
    "",
    "Remove the Oil Pan (Pos. 2) from the Crankcase (Pos. 1).",
    "Lift the Crankshaft (Pos. 3) out with the Flywheel (Pos. 4) attached.",
    "Unbolt the Connecting Rods (Pos. 5) from the crank throws.",
    "Lift Cylinder Bank L (Pos. 6) and Cylinder Bank R (Pos. 7) off the deck.",
    "Slide Camshaft L (Pos. 8) and Camshaft R (Pos. 9) out of the heads.",
    "Remove the Intake Manifold (Pos. 10) from the valley.",
    "Disconnect the Fuel Pump (Pos. 11) feed line.",
    "Unclip Fuel Rail L (Pos. 12) and Fuel Rail R (Pos. 13).",
    "Pull the Spark Plugs (Pos. 14).",
    "Push the Pistons (Pos. 15) out of Bank L after removing the rings.",
    "Release the Fuel Injectors (Pos. 21) from the rail clips.",
    "Bore 86 mm; stroke 86 mm; torque 25 Nm; gap 0.5 mm at 20 C room.",
    "Step 4 removes the seal. Install in reverse order. Torque to spec.",
]


def main() -> None:
    out = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data", "manuals", "v6-service-parts.pdf")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        f.write(make_pdf(LINES))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
