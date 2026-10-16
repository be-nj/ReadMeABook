# Audible region becomes per-Language; search runs one region at a time

`audible.region` was a single global scalar that drives language end-to-end — search store, result language-filtering, scraping selectors, ranking stop-words, and ebook (Anna's Archive) language. To support multiple **Shelves** in different languages, region moves to a per-**Language** attribute (each Shelf's language resolves to one searched region). Interactive **search** runs in **one** region per query (selected by a language filter, defaulting to the **Primary Shelf**) rather than fanning out across all regions and merging.

## Why

- Per-language region is unavoidable: without `region: de`, German books are neither found nor correctly scraped/ranked — multi-library on the `library_id` axis alone is useless.
- Single-region-per-search keeps Audible scraping load flat. Audible already rate-limits (503s); fanning out across N languages would multiply that load and add cross-region result de-duplication. BookDate may still cover all languages, but by rotating regions over time, not all at once.

## Consequences

- A book whose `language` matches no Shelf has no safe home and is requestable only by manual Shelf selection (no cross-language fallback).

## Amendment 2026-10-16: a Shelf owns a region *set*; search is scoped by Shelf

ASINs are store-specific (the same book has different ASINs on audible.com, .co.uk and .de). Searching "the primary Shelf's region" returned store-foreign ASINs that the rest of the app (details, routing, requests) could not resolve against the configured region. Two changes:

- A **Shelf** now carries an ordered set of Audible **Regions** (`regions`, home store first; `region` stays as a mirror of `regions[0]`). The home store implies the Shelf's **Language**. Typical: en/adult → `us` + `uk`, de/adult → `de`.
- Interactive **search** is scoped by **Shelf** (`?shelf=<libraryId>`), fanning out over *that Shelf's* stores in parallel and merging the pages; every result is tagged with the region it came from, and details/request calls carry that region. An explicit `?region=` still searches one store. Without a scope the **Primary Shelf**'s stores are used.

The "one region per query" rule becomes "one Shelf per query": the fan-out is bounded by a Shelf's store set (2–3 same-language stores), not by the number of languages, so Audible load stays flat per language and no cross-language merge is needed. Cross-store duplicates of one book are collapsed by the existing dedup and remembered as sibling ASINs in the works table.

