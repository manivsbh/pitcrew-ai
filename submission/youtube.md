# YouTube (unlisted)

Upload `submission/video/out/pitcrew-launch.mp4` (2:54). Fallback cut: `pitcrew-demo.mp4`.

**Title:** PitCrew.ai: a 1968 pump patent to a working 3D twin, built on Meta Muse

**Description:**

PitCrew gives heavy machinery a brain. Muse Spark reads a drawing it has never
seen and builds a 3D twin. SAM 2.1 and Muse Spark then check the render
against the drawing and fix it. A phone mic diagnoses the bearing, the agent
defends its call with evidence, and every confirmed teardown is distilled
into a rule the next diagnosis uses. All product footage is the real app,
recorded from the screen, with live Meta model calls.

Code: https://github.com/manivsbh/pitcrew-ai

Meta models used:
- Muse Spark 1.3 (api.meta.ai): blueprint review, render verification, manual chat, supervisor, investigator, assembly grounding, harness distillation
- Muse Image 1.0 (api.meta.ai): every b-roll shot in this film
- SAM 2.1 (local, CPU): drawing and workbench-photo segmentation
- wav2vec 2.0 (local): speech to text
- MMS-TTS (local): spoken replies

Chapters:
0:00 A 1968 patent, a 3D machine
0:08 Machines fail quietly
0:16 Meet PitCrew
0:22 Any drawing to 3D (Muse Spark)
0:33 It checks its own work (SAM 2.1 + Muse Spark)
0:46 A working twin, what-if physics
1:01 Talk to it (phone, wav2vec 2.0)
1:19 Listen: 76.2 Hz outer-race fault
1:36 Every part found (SAM 2.1)
1:48 Push back: it defends the diagnosis
2:05 Parts lined up
2:10 It learns (Harness² distillation)
2:23 Under the hood: architecture
2:35 Any blueprint
2:47 Open source

Disclosure:
- Waiting on model calls is sped up; each sped-up span shows its speed on
  screen. One span of SAM 2.1 CPU segmentation is trimmed and labelled.
- B-roll stills are generated with Meta Muse Image and labelled on screen.
- Narration: ElevenLabs (voice "Bella", free tier). The engineer's lines are
  synthetic (Kokoro TTS), labelled on screen.
- Music: "Inspiring Corporate" by Soundrider/Dope, CC BY (Jamendo).
- Renders are schematic: parametric shapes placed from the drawing, not CAD.

Meta calls behind the recorded spans (response ids):
- Blueprint review: resp_6aeb012e58b4f8f7015241f7 (24.5 s)
- Vision check rounds: resp_6aeb01dcfb18b25a88214549, resp_6aeb0278677f25640f3e4966
- Phone voice reply: resp_6aeb16fc5d04823a2fe942f7
- Phone acoustic diagnosis: resp_6aeafd88de0afe76214c4253, supervisor resp_6aeafd93f31186005808403c
- Workbench photo: SAM 2.1 (99.7 s CPU), assembly grounding resp_6aeb07f67b2983b4f5e5438f
- Push back: supervisor resp_6aeb0c3c98f17416e0d64059, reply resp_6aeb0c548d93e9a8a00a40c2
- Harness distillation: resp_6aeb5332c986867af1604a0c

Patent drawings: US 3,402,671, US 3,348,430 and US 3,513,339 (expired, public
domain; USPTO via Google Patents).
