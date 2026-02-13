# vpcr

A powerful Vite plugin that automatically tags React components with source reference attributes. This enables a seamless **"Alt + Click"** experience to jump from your browser directly to the corresponding line in your IDE.

**Documentation**: [https://vpcr.vercel.app](https://vpcr.vercel.app)  
**Changelog**: [https://vpcr.vercel.app/changelog](https://vpcr.vercel.app/changelog)

## Features

- **Automatic Tagging**: Injects `ref-id`, `ref-component`, `ref-line`, etc., into your JSX elements.
- **Click-to-Open**: Press `Alt + Click` in the browser to instantly open the source file in your editor at the exact line.
- **Smart Editor Defaults**: Built-in support for `antigravity`, `cursor`, and `vscode` (no manual configuration needed).
- **Flexible Configuration**: Full control over what attributes to inject and which files to include/exclude.
- **Team Friendly**: Environment variable overrides allow each developer to use their preferred editor.
- **Production Safe**: Automatically disables itself in production builds to keep your bundle clean.

## Installation

```bash
npm install vpcr --save-dev
# or
yarn add vpcr --dev
```

## Quick Start

Add the plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vpcrTagger } from 'vpcr';

export default defineConfig({
  plugins: [
    vpcrTagger({
      editor: 'antigravity', // Automatically handles line-positioning flags
    }),
    react(),
  ],
});
```

## Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `prefix` | `string` | `"data-ref"` | Prefix for the injected attributes (e.g., `ref-id`). |
| `attributes` | `string[]` | `['id', 'name', 'path', 'line', 'file', 'component']` | Which attributes to inject. |
| `basePath` | `string` | `"src"` | The base directory for calculating relative paths. |
| `include` | `(string \| RegExp)[]` | `['.tsx', '.jsx']` | Files to process. |
| `exclude` | `(string \| RegExp)[]` | `['node_modules', 'main.tsx']` | Files to ignore. |
| `enabled` | `boolean` | `true` | Enable or disable the plugin. |
| `editor` | `string` | `"code"` | Your preferred editor (e.g., `antigravity`, `cursor`, `code`). |
| `shouldTag` | `(comp, path) => boolean`| `() => true` | Custom filter for specific components or files. |
| `openInEditor`| `(path, line) => void` | `undefined` | Custom callback for manual editor integration. |

## Advanced Usage

### Custom Editor Command
If your editor needs a specific format, use `{file}` and `{line}` placeholders:
```typescript
vpcrTagger({
  editor: 'my-editor --goto {file}:{line}'
})
```

### Team Collaboration (Environment Overrides)
Developers can override the project-wide editor setting by adding a variable to their `.env.local` or `.env`:

```bash
# .env.local or .env
COMPONENT_REF_EDITOR=cursor
```

The plugin will automatically detect it's Cursor and use the correct positioning flags!

### Selective Tagging
Only tag components starting with "User":
```typescript
vpcrTagger({
  shouldTag: (name) => name.startsWith('User')
})
```

## License

MIT © SIRILMP
