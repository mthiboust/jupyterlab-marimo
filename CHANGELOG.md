# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-01-16

### Added

- **Official Marimo Icon**: .mo.py files now display the official marimo icon in the file browser and editor tabs
  - Icon sourced from the official marimo repository (32x32 PNG embedded in SVG)
- **Python File Support**: Any .py file can now be opened in Marimo via right-click → "Open With" → "Marimo Editor"
  - .mo.py files remain the default for Marimo Editor
  - Standard .py files still open in the default text editor by default
- **Dark Theme Synchronization**: Marimo editor automatically matches JupyterLab's current theme
  - Uses `data-jp-theme-light` attribute for reliable detection
  - Theme changes are detected via MutationObserver and applied in real-time

Thanks to [@ktaletsk](https://github.com/ktaletsk)!


## [0.1.0] - 2025-01-12

### Added

- Initial release of JupyterLab Marimo extension
- Automatic file type registration for `.mo.py` files
- Seamless integration with JupyterLab file browser
- Embedded Marimo editor in iframe within JupyterLab
- Context menu support for opening files in Marimo
- Error handling for missing Marimo or proxy services
- Development installation instructions
- Publishing workflow via PyPI

[0.1.1]: https://github.com/mthiboust/jupyterlab-marimo/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mthiboust/jupyterlab-marimo/releases/tag/v0.1.0
