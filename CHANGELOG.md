# Changelog

All notable changes to this project will be documented in this file.



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
