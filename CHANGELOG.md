# Changelog

All notable changes to this project will be documented in this file.


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
