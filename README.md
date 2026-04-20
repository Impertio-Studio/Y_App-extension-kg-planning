# Y-app Extension — KG Planning

Standalone iframe extension for [Y-app](https://github.com/OpenAEC-Foundation/Y-app).
Hosts a planning grid + Financieel/Projecten/HR dashboards for KG.

This repo builds into static HTML/JS + CSS, gets deployed to GitHub Pages,
and is loaded inside Y-app through the Extension Manager (a host-side
iframe + postMessage bridge).

## How it plugs into Y-app

1. This repo publishes to `https://<owner>.github.io/Y_App-extension-kg-planning/`.
2. In Y-app → **Settings → Extensions → Add**, paste that URL.
3. Y-app's Extension Manager stores the URL in the instance's SQLite row.
4. When a user opens the extension, Y-app renders:
   ```html
   <iframe sandbox="allow-scripts allow-same-origin"
           src="https://…/?host=<origin>&instance=<id>&erpUrl=<url>&lang=<nl|en>" />
   ```
5. The iframe calls ERPNext via `postMessage` → parent Y-app proxies the
   request using the user's ERPNext session. Credentials never reach the
   iframe.

## Development

```bash
npm install
npm run dev          # http://localhost:5174
npm run build        # → dist/
```

Running outside Y-app (`npm run dev` directly) will get "Extension loaded
outside Y-app iframe" errors from the bridge — that's expected. To test
it end-to-end, run Y-app locally and point its Extension Manager at
`http://localhost:5174/`.

## Files that talk to the host

- `src/bridge.ts` — the postMessage RPC. Exports `fetchList`,
  `fetchDocument`, `updateDocument`, `callMethod`, `getErpNextAppUrl`,
  `getActiveInstanceId`. Replaces what used to be Y-app's
  `lib/erpnext.ts` and `lib/instances.ts`.

Everything else is pure React and doesn't know the host exists.
