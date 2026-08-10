# Chora Resource Contract

This tree separates files used by the package builder from content read by the
running application.

| Source directory | Packaged location | Access contract |
|---|---|---|
| `resources/examples/` | `process.resourcesPath/examples/` | `window.api.readBundledExample(fileName)`; `.chora` and legacy `.mtda` only |
| `resources/help/` | `process.resourcesPath/help/` | `window.api.readHelpDocument(fileName)`; Markdown only |
| `resources/build/` | Not runtime content | electron-builder assets such as the future `icon.icns` |

During development, the main process resolves the first two directories under
`app.getAppPath()/resources/`. In a packaged application, electron-builder
copies them beside the application archive under `process.resourcesPath`.
Renderer code must never construct either path.

Only redistributable, public content belongs here.
`resources/examples/campus-study-spaces.mtda` is the P6-06 first-run example,
and `resources/help/orientation.md` is the P5-15 two-minute orientation.
