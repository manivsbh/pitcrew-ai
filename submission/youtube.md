# YouTube (unlisted)

**Title:** PitCrew.ai — a 1968 pump patent to a working 3D twin, verified by Meta vision

**Description:**

PitCrew gives heavy machinery a brain. It reads a drawing it has never seen,
builds a 3D twin, checks its own work with Meta vision, listens to the machine
through a phone, and drafts the repair kit. Everything shown is the real app,
recorded from the screen, with live Meta model calls.

Code: https://github.com/manivsbh/pitcrew-ai

Meta models used:
- muse-spark-1.3 (api.meta.ai): blueprint review, render verification, manual chat, supervisor, assembly grounding
- SAM 2.1 (local, CPU): drawing and workbench-photo segmentation
- wav2vec 2.0 (local): speech to text
- MMS-TTS (local): spoken replies

Chapters:
0:00 Intro
0:09 Unknown blueprint to 3D (US 3,402,671, public domain)
0:27 Meta eyes verify the build
0:45 A working twin
0:57 What if? (physics sandbox)
1:09 Talk to it (phone, wav2vec 2.0)
1:29 Listen to the machine (phone mic, fault frequencies)
1:50 See the parts (SAM 2.1)
2:10 Push back (the agent defends its diagnosis with evidence)
2:33 Stock the fix
2:41 Any machine (gearbox, fan, spindle)

Disclosure:
- Waiting on model calls is sped up; every sped-up span shows its speed on
  screen (up to 10×). SAM 2.1 runs on a laptop CPU, which is the slowest part.
- The engineer's voice is synthetic (Kokoro TTS), labelled on screen. The
  narration is also Kokoro. The music bed was generated for this video.
- Renders are schematic: parametric shapes placed from the drawing, not CAD.

Meta calls behind the recorded spans (response ids):
- Blueprint review: resp_6aeb012e58b4f8f7015241f7 (24.5 s)
- Vision check round 1 / 2: resp_6aeb01dcfb18b25a88214549, resp_6aeb0278677f25640f3e4966
- SAM 2.1 drawing segmentation: 109 s and 133 s on CPU
- Phone voice reply: resp_6aeb16fc5d04823a2fe942f7
- Phone acoustic diagnosis: resp_6aeafd88de0afe76214c4253, supervisor resp_6aeafd93f31186005808403c
- Workbench photo: SAM 2.1 (99.7 s), assembly grounding resp_6aeb07f67b2983b4f5e5438f
- Push back: supervisor resp_6aeb0c3c98f17416e0d64059, reply resp_6aeb0c548d93e9a8a00a40c2

Patent drawings: US 3,402,671, US 3,348,430 and US 3,513,339 (expired, public
domain; USPTO via Google Patents).
