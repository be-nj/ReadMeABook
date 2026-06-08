# PRD: Multi-Library Support

> Proposal for upstream ReadMeABook. Naming note: this document introduces the
> term **Shelf** for the new routing concept for clarity; the final name is open
> and should follow maintainer preference (it may stay "library").

## Problem

RMAB binds to a **single** Audiobookshelf library via the scalar config
`audiobookshelf.library_id`, and to a single Audible store via the scalar
`audible.region`. Users who organise their collection across several libraries
(e.g. English, German, Children's) hit two problems:

1. **False "not owned"**: ownership/dedup (BookDate, browse "hide owned",
   watched-list skips) only sees the one synced library, so books owned in the
   other libraries are suggested as if missing.
2. **No place to put a request**: a download imports to one `media_dir`, so a
   request can't be filed into the correct library, and non-English content
   can't even be found because `region` (which drives search language,
   scraping, ranking and ebook language) is global.

## Goals

- Sync **multiple** ABS libraries into the owned cache; ownership becomes the
  **union** across them.
- Route a request to the **correct** library by language and audience, with a
  manual override.
- Support multiple Audible **regions** so non-English content is findable.
- **Zero-friction backward compatibility**: existing single-library installs
  keep working with no user action.

## Non-goals

- Arbitrary rule-based routing engine (see ADR-0001 — a typed two-axis model is
  deliberate).
- Fanning every search across all regions and merging (see ADR-0002 — search is
  one region per query).
- Changing the matcher: it is already ASIN-global and library-agnostic.

## Concept

A **Shelf** is a request destination + owned-source, defined by a **Language**
and an ordered **Audience** tier (`kids` < `teen` < `adult`, extensible), bound
to one ABS library and one media output path. The occupied (Language × Audience)
cells form a sparse matrix.

- **Owned** = union of all Shelves (matcher unchanged).
- **Search** runs in **one** region per query, chosen by a language filter that
  defaults to the **Primary Shelf**'s language. (BookDate may cover all
  languages by rotating regions over time.)
- **Routing** of a request: auto-*suggest* from `language` (reliable) +
  audience-from-genres (best-guess); always overridable in the request dialog.
  Audience falls back **upward** to the next more-adult tier when its exact tier
  has no Shelf (never younger — the safe direction); Language has **no**
  fallback (a book whose language matches no Shelf is requestable only by manual
  Shelf selection). Primary Shelf is the last-resort fallback.

See `CONTEXT.md` for the full glossary and `docs/adr/` for the two load-bearing
decisions.

## Backward compatibility

- `audiobookshelf.library_id` (scalar) + `audible.region` (scalar) + `media_dir`
  are migrated transparently into a single **Shelf** marked primary. One Shelf ==
  today's behaviour exactly.
- A Prisma migration seeds that first Shelf; no user action required; existing
  tests stay green.

## Delivery (stacked, independently mergeable PRs)

1. **Multi-library owned sync (read-side).** `library_id` → list; sync all;
   rows tagged with `plex_library_id`; ownership union. Small, additive, fixes
   the false-"not owned" bug for any multi-library user. No region change.
2. **Region per Language / multi-region search (ADR-0002).** Region moves from
   global scalar to per-Language; interactive search runs one region with a
   language filter.
3. **Shelf routing for requests (write-side).** Routing as a pure function;
   request-dialog override; per-Shelf media path + ABS scan trigger.

## Open questions

- Final naming (Shelf vs library vs other) — maintainer's call.
- Whether the primary-Shelf concept should split into separate "search default"
  and "routing fallback" settings (kept unified here).
- BookDate region-rotation cadence.
