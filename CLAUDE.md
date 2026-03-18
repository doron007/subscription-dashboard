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
