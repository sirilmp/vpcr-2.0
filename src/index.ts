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

export function vpcrTagger(options: PluginOptions = {}): Plugin {
  const opts = { ...defaultOptions, ...options };
  const { prefix, attributes, basePath, include, exclude, enabled, shouldTag, editor, openInEditor } = opts;

  let config: ResolvedConfig;

  function jsxAttr(name: string, value: string) {
    return t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value));
  }

  const clientScript = `
    (function() {
      // Inject CSS
      const style = document.createElement('style');
      style.textContent = \`
        .vpcr-overlay {
          position: fixed;
          pointer-events: none;
          z-index: 999999;
          border: 2px dashed #3b82f6;
          background-color: rgba(59, 130, 246, 0.1);
          border-radius: 4px;
          transition: all 0.05s ease;
          box-sizing: border-box;
        }
        .vpcr-tooltip {
          position: fixed;
          z-index: 999999;
          background-color: #1e293b;
          color: white;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          pointer-events: none;
          white-space: nowrap;
          border: 1px solid #334155;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .vpcr-component-name {
          font-weight: 600;
          color: #60a5fa;
        }
        .vpcr-file-path {
          opacity: 0.7;
        }
      \`;
      document.head.appendChild(style);

      let overlay = null;
      let tooltip = null;
      let lastTarget = null;
      let isAltDown = false;

      function createUI() {
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'vpcr-overlay';
          document.body.appendChild(overlay);
        }
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.className = 'vpcr-tooltip';
          document.body.appendChild(tooltip);
        }
      }

      function removeUI() {
        if (overlay) {
          overlay.remove();
          overlay = null;
        }
        if (tooltip) {
          tooltip.remove();
          tooltip = null;
        }
        lastTarget = null;
      }

      function updateUI(target) {
        if (!target) return;
        
        createUI();
        const rect = target.getBoundingClientRect();
        const refId = target.getAttribute('${prefix}-id');
        const componentName = target.getAttribute('${prefix}-component') || 'Component';
        const [file, line] = refId.split(':');
        const offset = 4;

        // Update Overlay
        overlay.style.top = (rect.top - offset) + 'px';
        overlay.style.left = (rect.left - offset) + 'px';
        overlay.style.width = (rect.width + offset * 2) + 'px';
        overlay.style.height = (rect.height + offset * 2) + 'px';

        // Update Tooltip
        tooltip.innerHTML = \`<span class="vpcr-component-name">&lt;\${componentName}&gt;</span> <span class="vpcr-file-path">\${file}:\${line}</span>\`;
        
        const tooltipRect = tooltip.getBoundingClientRect();
        let tooltipTop = rect.top - tooltipRect.height - 8;
        let tooltipLeft = rect.left;

        if (tooltipTop < 0) {
          tooltipTop = rect.bottom + 8;
        }
        if (tooltipLeft + tooltipRect.width > window.innerWidth) {
          tooltipLeft = window.innerWidth - tooltipRect.width - 8;
        }

        tooltip.style.top = tooltipTop + 'px';
        tooltip.style.left = tooltipLeft + 'px';
      }

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Alt') {
          isAltDown = true;
          // Trigger immediate update if mouse is already over something
          // We can't easily get the element under cursor without mousemove, 
          // but next mousemove will catch it. 
          // However, to make it instant, we can track mouse pos if needed, 
          // but for simplicity, let's wait for mousemove or just toggle state.
        }
      }, true);

      window.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') {
          isAltDown = false;
          removeUI();
        }
      }, true);

      window.addEventListener('blur', () => {
        isAltDown = false;
        removeUI();
      }, true);

      window.addEventListener('mousemove', (e) => {
        // Safety check: if alt key is not pressed but we think it is, reset
        if (isAltDown && !e.altKey) {
          isAltDown = false;
          removeUI();
          return;
        }

        if (!isAltDown) return;
        
        const target = e.target.closest('[${prefix}-id]');
        if (target && target !== lastTarget) {
          lastTarget = target;
          updateUI(target);
        } else if (!target) {
          removeUI();
        }
      }, true);

      // Handle Scroll to update position
      window.addEventListener('scroll', () => {
        if (isAltDown && lastTarget) {
          updateUI(lastTarget);
        }
      }, true);

      // Click Handler
      const handleClick = (e) => {
        if (e.altKey) {
          const taggedElement = e.target.closest('[${prefix}-id]');
          if (taggedElement) {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            const refId = taggedElement.getAttribute('${prefix}-id');
            const [file, line] = refId.split(':');
            fetch('/__open-in-editor?file=' + encodeURIComponent(file) + '&line=' + line);
            
            // Visual feedback
            if (overlay) {
              overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
              setTimeout(() => {
                if (overlay) overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
              }, 150);
            }
          }
        }
      };
      
      window.addEventListener('mousedown', handleClick, true);
      window.addEventListener('click', handleClick, true);
    })();
  `;

  return {
    name: "vpcr",
    enforce: "pre",

    apply: "serve", // Ensure plugin only runs during dev
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
                    if (err) console.error(`[vpcrTagger] Command failed: ${finalCommand}`, err);
                  });
                } else {
                  launchEditor(`${absolutePath}:${lineNum}`, targetEditor);
                }
              }
            } catch (err) {
              console.error("[vpcrTagger] Error launching editor:", err);
            }

            res.end("ok");
            return;
          }
        }
        next();
      });
    },

    transformIndexHtml(html) {
      if (!enabled) return html;
      return [
        {
          tag: "script",
          children: clientScript,
          injectTo: "body",
        },
      ];
    },

    transform(code, id) {
      if (!enabled) return null;

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
              } else {
                // Check for HOCs (e.g. memo, forwardRef)
                let parent = p.parentPath;
                while (parent && parent.isCallExpression()) {
                  parent = parent.parentPath;
                }

                if (parent?.isVariableDeclarator()) {
                  if (t.isIdentifier(parent.node.id)) {
                    componentName = parent.node.id.name;
                  }
                } else if (parent?.isExportDefaultDeclaration()) {
                  componentName = path.basename(normalizedId, path.extname(normalizedId));
                }
              }
              if (componentName !== "unknown") break;
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
