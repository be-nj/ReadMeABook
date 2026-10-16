# ReadMeABook (Multi-Shelf Fork)

Audiobook request-and-acquisition app. This fork adds support for routing requests into, and detecting ownership across, **multiple** Audiobookshelf libraries instead of a single one.

## Language

### Library concepts (disambiguating the overloaded word "library")

**Shelf**:
A configured request destination, defined by a **Language** and an **Audience**, bound to one **ABS Library** (its owned-source), one media output path (its import target) and an ordered set of Audible **Regions** (its stores; the first is the **Home Store**).
_Avoid_: "Library" (when meaning this app-side concept), profile, collection, target.

**ABS Library**:
A library as it exists on the Audiobookshelf server (e.g. "Audiobooks 🇬🇧", "Kinder"). The external source a **Shelf** points at.
_Avoid_: "Library" unqualified.

**Owned cache**:
The app's local mirror of what the user already has, populated by syncing every **Shelf**'s **ABS Library**. (Currently the `plex_library` table — the name is legacy; it is backend-agnostic.)
_Avoid_: "Plex library" (misleading — used for ABS too).

**Library Backend**:
The kind of media server in use — Audiobookshelf *or* Plex — behind the `ILibraryService` interface. A deployment uses one.
_Avoid_: "Library" unqualified.

### Routing concepts

**Language**:
The axis (e.g. `de`, `en`) that selects which **Shelf** a book routes to. Implied by a Shelf's **Home Store**; read reliably from a book's `language` metadata.

**Region** / **Home Store**:
An Audible store (`us`, `uk`, `de`, …). ASINs are store-specific. A **Shelf** searches its whole region set; its **Home Store** (first region) implies its **Language** and is the preferred store for metadata lookups.

**Audience**:
The axis that splits a **Language** into separate **Shelves** — an *ordered, extensible* enum by age-appropriateness: `kids` < `teen` < `adult` (more tiers may be added). Inferred unreliably from a book's genres; therefore overridable. Ordering exists so a missing tier can fall back safely (see Routing).

**Owned**:
A book is owned if its ASIN (or a known sibling-edition ASIN) is present in the **Owned cache** — i.e. in *any* **Shelf**. Ownership is the union across Shelves.

**Routing**:
Assigning a requested book to a target **Shelf**. Hybrid: auto-*suggested* from **Language** (reliable) + **Audience** (best-guess), always overridable in the request dialog. When the exact **Audience** tier has no **Shelf**, the suggestion falls back *upward* to the next more-adult tier of the same **Language** (never younger — the safe direction), and to the primary **Shelf** as last resort. **Language**, by contrast, has *no* fallback: a book whose language matches no **Shelf** is requestable only by manual **Shelf** selection (there is no safe cross-language direction).

**Primary Shelf**:
The one **Shelf** marked primary. The last-resort **Routing** fallback, and the search scope used only until the user picks a **Shelf** in the search page (remembered per browser). On migration from the single-library setup, the pre-existing library becomes the first **Shelf** and the primary; reassignable later.

## Relationships

- A **Shelf** points at exactly one **ABS Library** and has exactly one **Language** and one **Audience**.
- **Language × Audience** is a sparse matrix; each occupied cell is a **Shelf** (e.g. de/adult, en/adult, de/kids; en/kids may appear later).
- Each **Shelf** owns its **Regions**; the union across Shelves is the set of stores the app can resolve an ASIN in.
- A search is scoped to one **Shelf** and fans out over that Shelf's **Regions**; **Routing** to a **Shelf** happens per result, adding the **Audience** split.
- **Owned** is computed across all **Shelves** (union); the matcher does not scope by **Shelf**.

## Flagged ambiguities

- "Library" was used for four distinct things — resolved: **ABS Library** (source), **Shelf** (app-side destination+owned-source), **Owned cache** (local table), **Library Backend** (Plex/ABS). Use the qualified term.

## Example dialogue

> **Dev:** "If I request a German children's audiobook, which **Shelf** does it land in?"
> **Domain expert:** "**Routing** reads `language: de` → German, and guesses **Audience** from genres. If it spots a kids genre it suggests the de/kids **Shelf**; if unsure it defaults to de/adult and I can override in the request dialog."
> **Dev:** "And it won't be re-suggested in BookDate afterwards?"
> **Domain expert:** "Right — once it's in any **Shelf**'s **ABS Library** and synced into the **Owned cache**, it's **Owned**, regardless of which Shelf."
