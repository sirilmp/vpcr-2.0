# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-02-12

### Added
- Initial release of `vite-plugin-component-ref`.
- Automatic JSX element tagging with `ref-id`, `ref-component`, `ref-line`, `ref-path`, and `ref-file`.
- "Alt + Click" functionality in the browser to open source files in the IDE.
- Smart editor defaults for `antigravity`, `cursor`, and `vscode`.
- Support for custom command templates with `{file}` and `{line}` placeholders.
- Environment variable override (`COMPONENT_REF_EDITOR`) for team collaboration.
- Advanced filtering and configuration options (`basePath`, `include`, `exclude`, `shouldTag`).
- Custom `openInEditor` callback for advanced integrations.
- Production build safety (automatic disable).
