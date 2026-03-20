# SubManager - Subscription Dashboard

## CRITICAL: Production Data Safety

**MUST NOT** modify, delete, or overwrite any production data in the Supabase database.

- **NEVER** run DELETE, UPDATE, DROP, or TRUNCATE on production `sub_*` tables without explicit user approval
- **NEVER** run destructive migrations against the production database
- **ALWAYS** use SELECT queries first to verify what will be affected before any write operation
- **ALWAYS** confirm with the user before executing any SQL that modifies data
- When adding new features, use INSERT or CREATE (additive operations) — never alter existing production rows
- Database backups: Daily physical backups with 7-day retention are configured on Supabase Pro plan

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Supabase (PostgreSQL + Auth)
- **Charts:** Recharts
- **AI:** OpenRouter API for invoice analysis
- **Icons:** Lucide React

## Database

- Supabase project: `dgghsrmxzasdvckncpjf`
- All app tables prefixed with `sub_` (shared database with other projects)
- Core tables: `sub_vendors`, `sub_subscriptions`, `sub_invoices`, `sub_invoice_line_items`, `sub_subscription_services`, `sub_profiles`

## Project Structure

- `/src/app/` — Pages and API routes (Next.js App Router)
- `/src/components/` — React components (dashboard, forms, modals, layout, ui)
- `/src/services/` — Client-side API wrappers (subscriptionService, aiService)
- `/src/lib/` — Business logic, DB layer, imports, Supabase clients
- `/src/types/` — TypeScript type definitions

## Claude Skills (Project Knowledge Base)

Project-specific skills live in `.claude/skills/` and capture architecture and domain knowledge for reuse across sessions.

| Skill | Path | Purpose |
|-------|------|---------|
| `sap-etl-pipeline` | `.claude/skills/sap-etl-pipeline/SKILL.md` | SAP GL OData ETL: classification rules, vendor matching, reconstruction strategies, multi-pass matching, billing month derivation |
| `submanager-architecture` | `.claude/skills/submanager-architecture/SKILL.md` | Full app architecture: DB schema, API routes, component hierarchy, import workflows, deployment, design decisions |

### Skill Maintenance Rules

- **When adding new vendors or changing ETL logic**: Update the `sap-etl-pipeline` skill with new vendor behaviors, classification rules, or matching changes
- **When adding pages, API routes, or DB tables**: Update the `submanager-architecture` skill with the new structure
- **When creating a new major subsystem** (e.g., a new import source, a new analytics feature): Create a new skill under `.claude/skills/<name>/SKILL.md`
- **Skills should document the "why" not just the "what"**: Include design decisions, known quirks, and vendor-specific behaviors that aren't obvious from reading code
- **Keep skills current**: If a session changes something documented in a skill, update the skill before ending the session
