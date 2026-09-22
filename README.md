# TD_008 Mangrove Measurement Lab

Deployment-only static bundle for the latest Samut Songkhram point-cloud webapp.

The live viewer is at `/viewer-experimental/`. The root page redirects there.
The bundle contains derived point-cloud evidence and the recovered review summary
for 118 Tree IDs. Raw LAS files, local caches, SQLite review history, and the
local retraining server are intentionally excluded.

The deployed site can inspect the published results and export browser-side
review changes as CSV. Durable review saving and retraining remain available in
the local viewer served by `start-review.ps1` in the analysis repository.
