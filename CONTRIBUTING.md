# Contributing to Chora

Thanks for helping improve Chora. The project is in an early release stage, so
the most useful contributions are clear observations about real workflows,
reproducible defects, and focused changes that preserve the application's
direct-manipulation model.

## Choose the right channel

- Start a [Discussion](https://github.com/maykawacode/chora/discussions) for
  questions, use cases, examples, and ideas that still need shaping.
- Open an [Issue](https://github.com/maykawacode/chora/issues) for a
  reproducible bug or a scoped improvement.
- Open a pull request when the change is ready for concrete review.

Search existing Discussions and Issues first. Please do not attach a Chora
session or imported dataset unless you are allowed to share everything it
contains.

## Development setup

```sh
git clone https://github.com/maykawacode/chora.git
cd chora
npm ci
npm run dev
```

## Before opening a pull request

1. Keep the change focused and explain the user problem it addresses.
2. Add or update tests for changed behavior where practical.
3. Run `npm test`, `npm run typecheck`, and `npm run build`.
4. Note any behavior that still requires manual verification.
5. Avoid unrelated formatting or dependency changes.

Chora uses React, TypeScript, Electron, Canvas, and Zustand. The main window
owns application state; map windows are linked views rather than independent
documents. Changes that affect persistence, history, or multi-window behavior
should describe those boundaries explicitly.
