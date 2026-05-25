# Changelog

All notable changes to this project will be documented in this file.



## [1.1.1] - 2026-05-25

### Added
- **Proactive Editor Pre-Scanning:** Spawns a background process scanner silently at server startup to pre-resolve and cache the active editor path, completely eliminating the Windows process/registry scanning delay on first click.

## [1.1.0] - 2026-05-24

### Added
- **In-Page Component Inspector:** A highly responsive floating button centered at the bottom of the viewport that toggles the inspector mode on and off with a single click.
- **Escape key support:** You can now press the `Esc` key to instantly exit and clean up the active inspector overlay.
- **Smart IDE Auto-Detection:** Automatically identifies whether you are running the project inside VS Code, Cursor,Antigravity IDE or any code editor, opening code files at the exact line instantly.

## [1.0.10] - 2026-05-10

### Added
- Added support for Vite `^8.0.0` in `peerDependencies`.

## [1.0.8] - 2026-02-19

### Added
- Added `enableHighlighter` option to `PluginOptions` (default: `true`).
- Improved tooltip to show component name even if not explicitly added to attributes.
- Updated the env variable name to `VPCR_EDITOR`

## [1.0.7] - 2026-02-17

### Fixed
- Fixed an issue where the highlighter overlay would remain visible after Alt-clicking a component and returning to the browser window without the Alt key pressed. Added a `blur` event listener to reset the state and improved `mousemove` checks.

## [1.0.4] - 2026-02-15


### Added

- **Visual Feedback**: When the modifier key (e.g., Alt/Option) is held down:
  - Draw a **highlight box** around the component under the cursor.
  - Show a **tooltip** with the component name (e.g., `<Button>`), file path (`src/components/Button.tsx`) and line number (`10`).


## [1.0.3] - 2026-02-15


### Added

- Added support for Vite `^7.0.0` in `peerDependencies`.

## [1.0.0]

### Added
- Initial release of `vpcr`.
- Automatic JSX element tagging with `ref-id`, `ref-component`, `ref-line`, `ref-path`, and `ref-file`.
- "Alt + Click" functionality in the browser to open source files in the IDE.
- Smart editor defaults for `antigravity`, `cursor`, and `vscode`.
- Support for custom command templates with `{file}` and `{line}` placeholders.
- Environment variable override (`COMPONENT_REF_EDITOR`) for team collaboration.
- Advanced filtering and configuration options (`basePath`, `include`, `exclude`, `shouldTag`).
- Custom `openInEditor` callback for advanced integrations.
- Production build safety (automatic disable).
- Configured plugin to only run in development mode (`apply: 'serve'`).
- Optimized build process by skipping plugin execution in production
