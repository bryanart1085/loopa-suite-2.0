<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- The LOOPA 3D modeler lives in `src/loopa/` (migrated from a Vite SPA) and is mounted at `/` via a lazy import inside `<ClientOnly>`; it uses three.js, IndexedDB and window APIs, so never import it statically from SSR code.
- LOOPA projects persist only in the browser (IndexedDB with localStorage mirror); there is no backend.
- `tsconfig.json` disables `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes` because the migrated LOOPA code was written without them; re-enable only after fixing `src/loopa/` for them.
- LOOPA Core ecosystem logic lives in `src/loopa/core/ecosystem/` (pure TS, unit-tested): app registry with owned data domains, per-domain project signatures, session finalize (history, UV basis, violations, stale-UV detection); project data carries it in `ProjectData.ecosystem`, which `normalizeProjectHierarchy` must preserve.
- The active app is derived in `App.tsx` from the workspace + work mode (layout+sculpt = Sculpt, uv_editing = UVs, materials = Materials, layout = Modeler); app switches go through the share modal (`EcosystemSwitchButton`), never through the top bar.
- Thumbnails may only be captured while the 3D viewport is visible (Modeler/Sculpt/Materials); otherwise the existing thumbnail is kept.
