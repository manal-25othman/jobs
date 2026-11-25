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

## Second pass — 7 approved hosts (2026-11-25)

`direct-check-2026-11-b.json` is a **research record, not an approval**. It rechecks the 9 records left `opened: false` above, after react.dev, google.github.io, github.com, www.gov.uk, cucumber.io, www.atlassian.com and learn.microsoft.com were approved. Same method: one curl GET per URL, following only that URL's redirects. No scripts ran and nothing was crawled.

- **Results:** 8 opened (all HTTP 200, no redirects, all served in English with free access). 1 not opened. 0 title mismatches. No provider states a duration.
- **Still blocked:** `lrc_version_control_basics_4` (github.com). This session's GitHub proxy refused it with HTTP 403. The 403 came from the proxy, not from github.com. It was not worked around.
- **Licences:**
  - www.gov.uk: Open Government Licence v3.0. Linking is explicitly welcomed.
  - react.dev: its terms are on lfprojects.org, which is not an approved host, so they were not opened. Licence `unclear`.
  - google.github.io: no licence notice or link on the pages. Its GitHub licence file was refused with a 403. Licence `unclear`.
  - github.com: refused with a 403. Licence `unclear`.
  - cucumber.io: the footer link `/docs/terms/` is a glossary ("Terminology"), not a terms page. Licence `unclear`.
  - www.atlassian.com: the "Terms" page is the product Customer Agreement and names no content licence. Licence `unclear`.
  - learn.microsoft.com: the Terms of Use name no content licence. They allow non-commercial or personal use only, with the notice kept. Licence `unclear`.
  - 4 of the 7 hosts have no terms page that was opened: react.dev, google.github.io, github.com and cucumber.io.
- **docs.github.com:** the proxy refused it (CONNECT 403), so it was skipped. Its licence stays `unclear`.
- The limits listed above still apply. Pages change: rerun this check before anything is exposed.
