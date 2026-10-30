# Chora Resource Contract

This tree separates files used by the package builder from content read by the
running application.

| Source directory | Packaged location | Access contract |
|---|---|---|
| `resources/examples/` | `process.resourcesPath/examples/` | `window.api.readBundledExample(fileName)`; `.chora` and legacy `.mtda` only |
| `resources/build/` | Not runtime content | electron-builder assets such as the future `icon.icns` |

During development, the main process resolves `resources/examples/` under
`app.getAppPath()/resources/`. In a packaged application, electron-builder
copies it beside the application archive under `process.resourcesPath`.
Renderer code must never construct either path.

Only redistributable, public content belongs here.
`resources/examples/sample-dataset.chora` is the first-run example. The
first-time guide lives on the site, at `site/quick-start.html`.
