# Submission checklist

## Must confirm from accepted participant instructions

- [ ] CC BY-NC 4.0 dataset compatibility with competition terms
- [ ] Required video length and format
- [ ] Repository visibility (public/private) and required files
- [ ] Submission fields and deadline (published: Nov 4, 9pm Eastern)

## In the repo

- Runnable app (backend + built UI served locally), pinned `requirements.txt`
  and `frontend/package-lock.json`, automated tests, eval protocol + results,
  saved investigation examples (see `data/reports/`, local only), setup guide
  (`README.md`), attribution + acquisition (`data/README.md`).

## Not in the repo (by design)

- Raw recordings (`*.mat`, archives), registry, traces, API keys.
- Reviewer path without data: `pip install -r requirements.txt`,
  `pytest tests/` (real-file tests skip cleanly), `npm run build` in
  `frontend/`. With data: `python scripts/download_all.py` first.
