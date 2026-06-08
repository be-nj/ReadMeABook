# Audible region becomes per-Language; search runs one region at a time

`audible.region` was a single global scalar that drives language end-to-end — search store, result language-filtering, scraping selectors, ranking stop-words, and ebook (Anna's Archive) language. To support multiple **Shelves** in different languages, region moves to a per-**Language** attribute (each Shelf's language resolves to one searched region). Interactive **search** runs in **one** region per query (selected by a language filter, defaulting to the **Primary Shelf**) rather than fanning out across all regions and merging.

## Why

- Per-language region is unavoidable: without `region: de`, German books are neither found nor correctly scraped/ranked — multi-library on the `library_id` axis alone is useless.
- Single-region-per-search keeps Audible scraping load flat. Audible already rate-limits (503s); fanning out across N languages would multiply that load and add cross-region result de-duplication. BookDate may still cover all languages, but by rotating regions over time, not all at once.

## Consequences

- A book whose `language` matches no Shelf has no safe home and is requestable only by manual Shelf selection (no cross-language fallback).
