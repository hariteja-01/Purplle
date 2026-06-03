Submission Guide for Purplle Tech Challenge 2026 — Round 2

Prepare the repository for submission (do NOT include datasets or videos):

1. Verify tests pass and coverage:

   $env:PYTHONPATH='.'; pytest -q

2. Build and smoke-test the Docker stack (optional):

   docker compose up --build -d
   # wait a few seconds, then run the smoke test
   python scripts/smoke_http.py http://localhost:8000

3. Create the submission archive (exclude data, venv, and large outputs):

   # From repository root (PowerShell)
   git clean -fdx --exclude=.git
   Compress-Archive -Path . -DestinationPath ../store-intelligence-submission.zip -CompressionLevel Optimal -Force

   # Alternative (zip on Unix/mac):
   # zip -r ../store-intelligence-submission.zip . -x "data/*" "*.db" ".venv/*" "store_intelligence.egg-info/*" "out/*"

4. Tag the final submission commit and push (so reviewers can pull exact state):

   git add -A
   git commit -m "chore: final submission for Purplle Round 2"
   git tag -a submission-round2 -m "Purplle Round 2 final submission"
   git push origin main --tags

Notes:
- Do NOT include any dataset/video files in the archive or the repo.
- Include `docs/`, `README.md`, `FINAL_RELEASE_CHECKLIST.md`, and `SUBMISSION.md` in the archive.
- If you need me to run the `Compress-Archive` command here, tell me and I'll execute it.
