# Direct link check — November 2026

`direct-check-2026-11.json` is a **research record, not an approval**. It records what was observed when the 48 candidate links in `../resources.candidate.json` were opened directly on 2026-11-25 (Phase B, decision 2).

## Method
- Each `url` was requested **once** with `curl` (GET, following only that URL's redirects, 30 s timeout) through this environment's HTTPS proxy. No scripts ran, no crawling, and nothing other than the page itself was downloaded.
- `http_status` and `final_url` come from curl. `page_title` is the served `<title>`. `language_served` is the `<html lang>` attribute.
- `free_access: true` means the served HTML contained the article text and no sign-in or paywall prompt.
- `duration_stated_by_provider` is filled in only where the page text itself gives a duration. Nothing was estimated.
- For each distinct host, the licence or terms page linked from the resource page's footer (or its licence notice) was opened once. Only short phrases are quoted.

## Results
- 39 opened (all HTTP 200). 9 not opened. 0 title mismatches. 8 of 16 hosts have no terms page that was opened.
- One redirect: `lrc_technical_explanation_3` now resolves to `/en/pull-requests/concepts/helping-others-review-your-changes`.

## Limits
- **Unreachable hosts:** react.dev, google.github.io, www.gov.uk, cucumber.io, www.atlassian.com and learn.microsoft.com were refused by the environment's proxy. github.com was refused by the session's GitHub proxy. These records are marked `host not allowed in this environment`. Their status, title and licence are **unknown**, not failed.
- `title_matches` is a human judgement of substance. Differences in punctuation or site suffix were ignored.
- `free_access` reflects one anonymous request from one location. It is not a guarantee for every user or region.
- A licence quoted here is the provider's statement on the day of the check, not legal advice. Where the page did not state a content licence (docs.github.com), the record says `unclear`.
- OWASP's licence was read from the resource page footer. No separate terms page was found on that host.
- Pages change: this check needs to be rerun before anything is exposed.
