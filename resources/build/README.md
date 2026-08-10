# Build Resources

This directory is reserved for electron-builder inputs that are not read by the
running application. `entitlements.mac.plist` supplies the minimal Electron
runtime permissions used by the free ad-hoc signature. P6-13 will add the final
`icon.icns` here.

Do not put example sessions or Help content in this directory; those belong in
the sibling `examples/` and `help/` directories and cross the preload boundary
through their dedicated read-only APIs.
