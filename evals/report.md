# Evaluation report

## baseline / dev (n=36 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.917
- accuracy overall: 33/36 = 0.917
- abstention rate: 0.083
- accuracy among answered: 33/33 = 1.000
- damaged called healthy: 0
- mean latency: 0.1s; mean tokens in/out: 0/0
- per-bearing majority: 3/3 {'K001': 'healthy', 'KA04': 'outer_ring_damage', 'KI04': 'inner_ring_damage'}

## fixed / dev (n=36 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.667
- accuracy overall: 24/36 = 0.667
- abstention rate: 0.167
- accuracy among answered: 24/30 = 0.800
- damaged called healthy: 0
- mean latency: 5.1s; mean tokens in/out: 429/1139
- per-bearing majority: 2/3 {'K001': 'outer_ring_damage', 'KA04': 'outer_ring_damage', 'KI04': 'inner_ring_damage'}

## investigate / dev (n=36 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.444
- accuracy overall: 16/36 = 0.444
- abstention rate: 0.556
- accuracy among answered: 16/16 = 1.000
- damaged called healthy: 0
- mean latency: 76.4s; mean tokens in/out: 15897/2061
- per-bearing majority: 3/3 {'K001': 'healthy', 'KA04': 'outer_ring_damage', 'KI04': 'inner_ring_damage'}

## baseline / val (n=60 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.283
- accuracy overall: 17/60 = 0.283
- abstention rate: 0.650
- accuracy among answered: 17/21 = 0.810
- damaged called healthy: 0
- mean latency: 0.1s; mean tokens in/out: 0/0
- per-bearing majority: 2/3 {'K002': 'outer_ring_damage', 'KA15': 'outer_ring_damage', 'KI14': 'inner_ring_damage'}

## fixed / val (n=60 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.433
- accuracy overall: 26/60 = 0.433
- abstention rate: 0.267
- accuracy among answered: 26/44 = 0.591
- damaged called healthy: 0
- mean latency: 5.6s; mean tokens in/out: 428/1272
- per-bearing majority: 2/3 {'K002': 'outer_ring_damage', 'KA15': 'outer_ring_damage', 'KI14': 'inner_ring_damage'}

## investigate / val (n=60 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.067
- accuracy overall: 4/60 = 0.067
- abstention rate: 0.700
- accuracy among answered: 4/18 = 0.222
- damaged called healthy: 5
- mean latency: 72.9s; mean tokens in/out: 15330/2081
- per-bearing majority: 1/3 {'K002': 'outer_ring_damage', 'KA15': 'outer_ring_damage', 'KI14': 'outer_ring_damage'}

## baseline / final (n=60 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.333
- accuracy overall: 20/60 = 0.333
- abstention rate: 0.500
- accuracy among answered: 20/30 = 0.667
- damaged called healthy: 0
- mean latency: 0.1s; mean tokens in/out: 0/0
- per-bearing majority: 1/3 {'K003': 'outer_ring_damage', 'KA16': 'outer_ring_damage', 'KI16': 'outer_ring_damage'}

## fixed / final (n=60 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.367
- accuracy overall: 22/60 = 0.367
- abstention rate: 0.283
- accuracy among answered: 22/43 = 0.512
- damaged called healthy: 0
- mean latency: 5.6s; mean tokens in/out: 428/1226
- per-bearing majority: 1/3 {'K003': 'outer_ring_damage', 'KA16': 'outer_ring_damage', 'KI16': 'outer_ring_damage'}

## investigate / final (n=60 recordings, 3 bearings)
- balanced accuracy (abstain=miss): 0.167
- accuracy overall: 10/60 = 0.167
- abstention rate: 0.683
- accuracy among answered: 10/19 = 0.526
- damaged called healthy: 2
- mean latency: 71.9s; mean tokens in/out: 15169/1832
- per-bearing majority: 1/3 {'K003': 'outer_ring_damage', 'KA16': 'outer_ring_damage', 'KI16': 'healthy'}

## Challenge KB23 (unscored)
- baseline N09_M07_F10 rep1: outer_ring_damage (0s)
- baseline N09_M07_F10 rep5: outer_ring_damage (0s)
- baseline N09_M07_F10 rep9: outer_ring_damage (0s)
- baseline N09_M07_F10 rep13: outer_ring_damage (0s)
- baseline N09_M07_F10 rep17: outer_ring_damage (0s)
- baseline N15_M01_F10 rep1: insufficient_evidence (0s)
- baseline N15_M01_F10 rep5: outer_ring_damage (0s)
- baseline N15_M01_F10 rep9: outer_ring_damage (0s)
- baseline N15_M01_F10 rep13: outer_ring_damage (0s)
- baseline N15_M01_F10 rep17: insufficient_evidence (0s)
- baseline N15_M07_F04 rep1: insufficient_evidence (0s)
- baseline N15_M07_F04 rep5: insufficient_evidence (0s)
- baseline N15_M07_F04 rep9: insufficient_evidence (0s)
- baseline N15_M07_F04 rep13: insufficient_evidence (0s)
- baseline N15_M07_F04 rep17: insufficient_evidence (0s)
- baseline N15_M07_F10 rep1: insufficient_evidence (0s)
- baseline N15_M07_F10 rep5: outer_ring_damage (0s)
- baseline N15_M07_F10 rep9: insufficient_evidence (0s)
- baseline N15_M07_F10 rep13: outer_ring_damage (0s)
- baseline N15_M07_F10 rep17: insufficient_evidence (0s)
- fixed N09_M07_F10 rep1: outer_ring_damage (7s)
- fixed N09_M07_F10 rep5: outer_ring_damage (4s)
- fixed N09_M07_F10 rep9: outer_ring_damage (4s)
- fixed N09_M07_F10 rep13: outer_ring_damage (7s)
- fixed N09_M07_F10 rep17: outer_ring_damage (5s)
- fixed N15_M01_F10 rep1: outer_ring_damage (6s)
- fixed N15_M01_F10 rep5: outer_ring_damage (4s)
- fixed N15_M01_F10 rep9: outer_ring_damage (5s)
- fixed N15_M01_F10 rep13: outer_ring_damage (4s)
- fixed N15_M01_F10 rep17: outer_ring_damage (5s)
- fixed N15_M07_F04 rep1: outer_ring_damage (5s)
- fixed N15_M07_F04 rep5: insufficient_evidence (7s)
- fixed N15_M07_F04 rep9: outer_ring_damage (6s)
- fixed N15_M07_F04 rep13: outer_ring_damage (5s)
- fixed N15_M07_F04 rep17: inner_ring_damage (8s)
- fixed N15_M07_F10 rep1: insufficient_evidence (8s)
- fixed N15_M07_F10 rep5: outer_ring_damage (4s)
- fixed N15_M07_F10 rep9: outer_ring_damage (5s)
- fixed N15_M07_F10 rep13: outer_ring_damage (4s)
- fixed N15_M07_F10 rep17: insufficient_evidence (8s)
- investigate N09_M07_F10 rep1: outer_ring_damage (84s)
- investigate N09_M07_F10 rep5: insufficient_evidence (80s)
- investigate N09_M07_F10 rep9: outer_ring_damage (64s)
- investigate N09_M07_F10 rep13: insufficient_evidence (83s)
- investigate N09_M07_F10 rep17: insufficient_evidence (67s)
- investigate N15_M01_F10 rep1: outer_ring_damage (102s)
- investigate N15_M01_F10 rep5: insufficient_evidence (114s)
- investigate N15_M01_F10 rep9: insufficient_evidence (64s)
- investigate N15_M01_F10 rep13: outer_ring_damage (108s)
- investigate N15_M01_F10 rep17: insufficient_evidence (71s)
- investigate N15_M07_F04 rep1: insufficient_evidence (30s)
- investigate N15_M07_F04 rep5: insufficient_evidence (45s)
- investigate N15_M07_F04 rep9: outer_ring_damage (85s)
- investigate N15_M07_F04 rep13: outer_ring_damage (91s)
- investigate N15_M07_F04 rep17: outer_ring_damage (81s)
- investigate N15_M07_F10 rep1: insufficient_evidence (100s)
- investigate N15_M07_F10 rep5: outer_ring_damage (72s)
- investigate N15_M07_F10 rep9: outer_ring_damage (72s)
- investigate N15_M07_F10 rep13: outer_ring_damage (79s)
- investigate N15_M07_F10 rep17: outer_ring_damage (75s)

