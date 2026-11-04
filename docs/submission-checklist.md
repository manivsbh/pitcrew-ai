# Submission checklist

## Must confirm from accepted participant instructions

- [x] CC BY-NC 4.0 dataset: not used in the video; demo uses bundled synthetic
  signals and public-domain patents only
- [x] Video: 2:55, English, real screen footage with live Meta calls, sped-up
  spans marked (`submission/video/out/pitcrew-demo.mp4`)
- [x] Repository public (`manivsbh/pitcrew-ai`) with setup and judge path in `README.md`
- [x] Judge front-door `JUDGES.md` (run check, guided tour, live-call pointer), linked from top of `README.md`
- [ ] Upload the video to YouTube as unlisted (copy in `submission/youtube.md`)
- [ ] Post on X (copy in `submission/x-post.md`) and paste both links into the form
- [ ] Submit before Wed Nov 4, 9:00 PM Eastern (02:00 UTC Nov 5)

## In the repo

- Runnable app (backend + built UI served locally), pinned `requirements.txt`
  and `frontend/pnpm-lock.yaml`, automated tests, eval protocol + results,
  saved investigation examples (see `data/reports/`, local only), setup guide
  (`README.md`), attribution + acquisition (`data/README.md`).

## Not in the repo (by design)

- Raw recordings (`*.mat`, archives), registry, traces, API keys.
- Reviewer path without data: `pip install -r requirements.txt`,
  `pytest tests/` (real-file tests skip cleanly), `npx -y pnpm@10.34.3 install`
  then `npx -y pnpm@10.34.3 run build` in `frontend/`. With data:
  `python scripts/download_all.py` first.
