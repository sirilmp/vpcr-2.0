import { Plugin, ResolvedConfig, loadEnv } from "vite";
import { parse } from "@babel/parser";
import * as t from "@babel/types";
import path from "path";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import launchEditor from "launch-editor";
import { exec } from "child_process";

const traverse = (typeof _traverse === "function" ? _traverse : (_traverse as any).default) as typeof _traverse;
const generate = (typeof _generate === "function" ? _generate : (_generate as any).default) as typeof _generate;

export interface PluginOptions {
  prefix?: string;
  attributes?: ("id" | "name" | "path" | "line" | "file" | "component")[];
  basePath?: string;
  include?: string | RegExp | (string | RegExp)[];
  exclude?: string | RegExp | (string | RegExp)[];
  enabled?: boolean;
  shouldTag?: (componentName: string, filePath: string) => boolean;
  editor?: string;
  openInEditor?: (filePath: string, line: number) => void;
}

const defaultOptions: Required<PluginOptions> = {
  prefix: "data-ref",
  attributes: ["id", "name", "path", "line", "file", "component"],
  basePath: "src",
  include: [".tsx", ".jsx"],
  exclude: ["node_modules", "main.tsx"],
  enabled: true,
  shouldTag: () => true,
  editor: "code",
  openInEditor: () => {},
};

function matches(id: string, pattern: string | RegExp | (string | RegExp)[]): boolean {
  if (Array.isArray(pattern)) {
    return pattern.some((p) => matches(id, p));
  }
  if (pattern instanceof RegExp) {
    return pattern.test(id);
  }
  return id.endsWith(pattern) || id.includes(pattern);
}

export function componentRefTagger(options: PluginOptions = {}): Plugin {
  const opts = { ...defaultOptions, ...options };
  const { prefix, attributes, basePath, include, exclude, enabled, shouldTag, editor, openInEditor } = opts;

  let config: ResolvedConfig;

  function jsxAttr(name: string, value: string) {
    return t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value));
  }

  const clientScript = `
    (function() {
      const handleEvent = (e) => {
        if (e.altKey) {
          const taggedElement = e.target.closest('[${prefix}-id]');
          if (taggedElement) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.type === 'mousedown') {
              const refId = taggedElement.getAttribute('${prefix}-id');
              const [file, line] = refId.split(':');
              fetch('/__open-in-editor?file=' + encodeURIComponent(file) + '&line=' + line);
            }
          }
        }
      };
      window.addEventListener('mousedown', handleEvent, true);
      window.addEventListener('click', handleEvent, true);
    })();
  `;

  return {
    name: "vite-plugin-component-ref",
    enforce: "pre",

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      const env = loadEnv(config.mode, config.root, "");
      if (env.COMPONENT_REF_EDITOR) {
        process.env.COMPONENT_REF_EDITOR = env.COMPONENT_REF_EDITOR;
      }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/__open-in-editor")) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const file = url.searchParams.get("file");
          const line = url.searchParams.get("line");
          if (file) {
            const absolutePath = path.resolve(config.root, file);
            const lineNum = parseInt(line || "1", 10);

            try {
              if (options.openInEditor) {
                options.openInEditor(absolutePath, lineNum);
              } else {
                // Priority: 1. Env Var, 2. Options, 3. Default
                const targetEditor = process.env.COMPONENT_REF_EDITOR || editor;
                let cmdTemplate = targetEditor;

                // Smart defaults for known editors
                const isVSCodeBase = ["cursor", "cursor-nightly", "code", "code-insiders", "antigravity", "agy"].includes(targetEditor || "");
                
                if (isVSCodeBase && (!cmdTemplate || !cmdTemplate.includes("{file}"))) {
                  cmdTemplate = `${targetEditor} -g "{file}":{line}`;
                }

                if (cmdTemplate && (cmdTemplate.includes("{file}") || cmdTemplate.includes("{line}"))) {
                  const command = cmdTemplate
                    .replace("{file}", absolutePath)
                    .replace("{line}", String(lineNum));
                  
                  // Final safety: ensure absolutePath is quoted in the final command
                  const finalCommand = command.includes(`"${absolutePath}"`) 
                    ? command 
                    : command.replace(absolutePath, `"${absolutePath}"`);

                  exec(finalCommand, (err) => {
                    if (err) console.error(`[ComponentRefTagger] Command failed: ${finalCommand}`, err);
                  });
                } else {
                  launchEditor(`${absolutePath}:${lineNum}`, targetEditor);
                }
              }
            } catch (err) {
              console.error("[ComponentRefTagger] Error launching editor:", err);
            }

            res.end("ok");
            return;
          }
        }
        next();
      });
    },

    transformIndexHtml(html) {
      if (config.command === "build" || !enabled) return html;
      return [
        {
          tag: "script",
          children: clientScript,
          injectTo: "body",
        },
      ];
    },

    transform(code, id) {
      if (config.command === "build" || !enabled) return null;

      const cleanId = id.split("?")[0];
      const normalizedId = cleanId.replace(/\\/g, "/");
      const normalizedBasePath = basePath.replace(/^\/|\/$/g, "");

      if (!matches(normalizedId, include) || matches(normalizedId, exclude) || !normalizedId.includes(`/${normalizedBasePath}/`)) {
        return null;
      }

      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });

      traverse(ast, {
        JSXOpeningElement(jsxPath: any) {
          if (!jsxPath.node.loc) return;

          // Find the enclosing component name
          let componentName = "unknown";
          let p = jsxPath.parentPath;
          while (p) {
            if (p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression()) {
              if (p.node.id) {
                componentName = p.node.id.name;
              } else if (p.parentPath?.isVariableDeclarator()) {
                if (t.isIdentifier(p.parentPath.node.id)) {
                  componentName = p.parentPath.node.id.name;
                }
              } else if (p.parentPath?.isExportDefaultDeclaration()) {
                componentName = path.basename(normalizedId, path.extname(normalizedId));
              }
              break;
            }
            p = p.parentPath;
          }

          if (!shouldTag(componentName, normalizedId)) return;

          const searchPath = `/${normalizedBasePath}/`;
          const srcIndex = normalizedId.indexOf(searchPath);
          if (srcIndex === -1) return;

          const relPath = normalizedId.slice(srcIndex + 1);
          const line = jsxPath.node.loc.start.line;
          const fileName = path.basename(cleanId);

          const idAttrName = `${prefix}-id`;
          if (jsxPath.node.attributes.some((attr: any) => t.isJSXAttribute(attr) && attr.name.name === idAttrName)) return;

          const attrsToAdd: any[] = [];
          if (attributes.includes("id")) attrsToAdd.push(jsxAttr(`${prefix}-id`, `${relPath}:${line}`));
          if (attributes.includes("name")) attrsToAdd.push(jsxAttr(`${prefix}-name`, jsxPath.node.name.name || "unknown"));
          if (attributes.includes("path")) attrsToAdd.push(jsxAttr(`${prefix}-path`, relPath));
          if (attributes.includes("line")) attrsToAdd.push(jsxAttr(`${prefix}-line`, String(line)));
          if (attributes.includes("file")) attrsToAdd.push(jsxAttr(`${prefix}-file`, fileName));
          if (attributes.includes("component")) attrsToAdd.push(jsxAttr(`${prefix}-component`, componentName));

          jsxPath.node.attributes.unshift(...attrsToAdd);
        },
      });

      return generate(ast, { retainLines: true }, code).code;
    },
  };
}
