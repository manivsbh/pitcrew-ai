# Data: acquisition, splits, attribution

Recordings live here, outside version control (`*.mat` and `data/recordings/`
are git-ignored). Never commit raw recordings.

## Acquisition

Per-bearing archives from the official Paderborn archive:

    https://groups.uni-paderborn.de/kat/BearingDataCenter/<BEARING>.rar

Fetch one bearing (downloads archive, hashes it, extracts a sample):

    source .venv/bin/activate
    python scripts/fetch_sample.py --bearing K001 --out data/recordings

Requires `unrar` or `unar` (`brew install unrar`). Reserve ~10 GB for the
full set of archives plus extracted files.

## Splits (initial, small benchmark)

| Split | Healthy | Outer-ring | Inner-ring |
|---|---|---|---|
| Development | K001 | KA04 | KI04 |
| Validation | K002 | KA15 | KI14 |
| Final evaluation | K003 | KA16 | KI16 |

Challenge: KB23 (mixed fault). Final evaluation: all four operating conditions
x repetitions 1, 5, 9, 13, 17 = 60 recordings across 3 unseen bearings.

Rules: every recording from a bearing stays in its split; strip diagnostic
filenames/identifiers from agent inputs; labels live only in the evaluator.

## Attribution

Vibration data: Paderborn University Bearing DataCenter, KAt Chair.
License: CC BY-NC 4.0 (see the Bearing DataCenter site). Cite the DataCenter
and the accompanying PHM paper in any submission or report.

Data-use gate: confirm CC BY-NC 4.0 compatibility with the accepted
competition terms before submission use.
