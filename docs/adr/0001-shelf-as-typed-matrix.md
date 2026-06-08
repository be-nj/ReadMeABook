# Shelf as a typed (Language × Audience) matrix, not a rule engine

A **Shelf** (request destination + owned-source) is modelled as a typed pair of `language` and an ordered `audience` enum, so **Routing** is a deterministic lookup over a sparse matrix. We rejected a per-Shelf predicate/rule-engine ("first matching rule wins") because the real domain is exactly two axes, and the rule engine buys only YAGNI flexibility at the cost of rule-ordering ambiguity and a harder UI — while the one genuinely fuzzy axis (Audience) is already handled by the hybrid override rather than by rule complexity.

## Consequences

- Adding a brand-new routing *axis* (beyond Language/Audience) is a schema/model change, not config. Adding a new *value* on an existing axis (e.g. an `en/kids` Shelf, or a `teen` tier) is just a new occupied cell.
- Routing is explainable ("de + kids → this Shelf") and collision-free.
