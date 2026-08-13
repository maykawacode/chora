# Build Resources

This directory contains electron-builder inputs that are not read by the
running application. `entitlements.mac.plist` supplies the minimal Electron
runtime permissions used by the free ad-hoc signature. `chora-icon-source.png`
is the 1024×1024 source artwork, and `icon.icns` is the generated macOS package
icon.

Do not put example sessions or Help content in this directory; those belong in
the sibling `examples/` and `help/` directories and cross the preload boundary
through their dedicated read-only APIs.
