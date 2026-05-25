import { Plugin, ResolvedConfig, loadEnv } from "vite";
import { parse } from "@babel/parser";
import * as t from "@babel/types";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import launchEditor from "launch-editor";
import { exec, spawn } from "child_process";

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
  enableHighlighter?: boolean;
  enableAudioFeedback?: boolean;
}

const defaultOptions: Required<PluginOptions> = {
  prefix: "data-ref",
  attributes: ["id", "name", "path", "line", "file", "component"],
  basePath: "src",
  include: [".tsx", ".jsx"],
  exclude: ["node_modules", "main.tsx"],
  enabled: true,
  shouldTag: () => true,
  editor: "",
  openInEditor: () => { },
  enableHighlighter: true,
  enableAudioFeedback: true,
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
  const { prefix, attributes, basePath, include, exclude, enabled, shouldTag, editor, openInEditor, enableHighlighter, enableAudioFeedback } = opts;

  let config: ResolvedConfig;

  function jsxAttr(name: string, value: string) {
    return t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value));
  }

  // Read and base64 encode the logos
  let viteLogoBase64 = "";
  let vpcrLogoBase64 = "";
  try {
    let currentDir = "";
    try {
      if (typeof __dirname !== 'undefined' && __dirname) {
        currentDir = __dirname;
      } else {
        currentDir = path.dirname(fileURLToPath(import.meta.url));
      }
    } catch (e) {
      currentDir = process.cwd();
    }

    if (currentDir) {
      const vitePath = path.resolve(currentDir, "icons/vite.png");
      const vpcrPath = path.resolve(currentDir, "icons/vpcr.png");
      const srcVitePath = path.resolve(currentDir, "../src/icons/vite.png");
      const srcVpcrPath = path.resolve(currentDir, "../src/icons/vpcr.png");
      const nodeModulesVitePath = path.resolve(currentDir, "node_modules/vpcr/dist/icons/vite.png");
      const nodeModulesVpcrPath = path.resolve(currentDir, "node_modules/vpcr/dist/icons/vpcr.png");

      let resolvedVitePath = "";
      if (fs.existsSync(vitePath)) resolvedVitePath = vitePath;
      else if (fs.existsSync(srcVitePath)) resolvedVitePath = srcVitePath;
      else if (fs.existsSync(nodeModulesVitePath)) resolvedVitePath = nodeModulesVitePath;

      let resolvedVpcrPath = "";
      if (fs.existsSync(vpcrPath)) resolvedVpcrPath = vpcrPath;
      else if (fs.existsSync(srcVpcrPath)) resolvedVpcrPath = srcVpcrPath;
      else if (fs.existsSync(nodeModulesVpcrPath)) resolvedVpcrPath = nodeModulesVpcrPath;

      if (resolvedVitePath) {
        viteLogoBase64 = fs.readFileSync(resolvedVitePath, "base64");
      }
      if (resolvedVpcrPath) {
        vpcrLogoBase64 = fs.readFileSync(resolvedVpcrPath, "base64");
      }
    }
  } catch (e: any) {
    console.warn("[vpcr] Logo loading warning:", e?.message || e);
  }

  const clientScript = `
    (function() {
      const enableHighlighter = ${enableHighlighter};
      const enableAudioFeedback = ${enableAudioFeedback};
      
      const viteLogo = "${viteLogoBase64 ? `data:image/png;base64,${viteLogoBase64}` : ''}";
      const vpcrLogo = "${vpcrLogoBase64 ? `data:image/png;base64,${vpcrLogoBase64}` : ''}";
      
      let audioCtx = null;
      function playPop() {
        if (!enableAudioFeedback) return;
        try {
          if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          }
          if (audioCtx.state === 'suspended') {
            audioCtx.resume();
          }
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          
          oscillator.type = 'sine';
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);

          gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 0.1);
        } catch (e) {
          // Ignore audio errors
        }
      }

      // Inject CSS
      const style = document.createElement('style');
      style.textContent = \`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap');
        .vpcr-overlay {
          position: fixed;
          pointer-events: none;
          z-index: 999999;
          border: 2px dashed #22d3ee;
          background-color: rgba(34, 211, 238, 0.08);
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
          color: #22d3ee;
        }
        .vpcr-file-path {
          opacity: 0.7;
        }
        .vpcr-dock {
          position: fixed;
          bottom: 0px;
          left: 50%;
          transform: translateX(-50%) translateY(25%);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(12px) saturate(180%);
          -webkit-backdrop-filter: blur(12px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999999;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1);
          box-sizing: border-box;
          transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
          padding: 0;
          cursor: pointer;
        }
        .vpcr-dock-trigger {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          transition: all 0.3s ease;
          opacity: 1;
        }
        .vpcr-dock-trigger-logo {
          height: 10px;
          width: 10px;
          object-fit: contain;
          transition: all 0.3s ease;
        }
        .vpcr-dock-buttons {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 0;
          opacity: 0;
          overflow: hidden;
          transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .vpcr-dock.expanded, .vpcr-dock.active {
          bottom: 5px;
          transform: translateX(-50%) translateY(0);
          width: 66px;
          height: 32px;
          border-radius: 20px;
          padding: 4px 6px;
        }
        .vpcr-dock.expanded .vpcr-dock-trigger, .vpcr-dock.active .vpcr-dock-trigger {
          width: 0;
          opacity: 0;
          pointer-events: none;
          margin: 0;
          overflow: hidden;
        }
        .vpcr-dock.expanded .vpcr-dock-buttons, .vpcr-dock.active .vpcr-dock-buttons {
          width: 54px;
          opacity: 1;
          overflow: visible;
        }
        .vpcr-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: transparent;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          box-sizing: border-box;
          border: none;
          padding: 0;
        }
        .vpcr-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.08);
          transform: scale(1.1) translateY(-1px);
        }
        .vpcr-btn:active {
          transform: scale(0.95);
        }
        .vpcr-btn.active {
          background: linear-gradient(135deg, #22d3ee, #a78bfa);
          color: #0f172a;
          animation: vpcr-pulse 2s infinite;
        }
        .vpcr-btn.active:hover {
          background: linear-gradient(135deg, #22d3ee, #a78bfa);
          color: #0f172a;
          box-shadow: 0 0 15px rgba(34, 211, 238, 0.6);
        }
        .vpcr-btn::after {
          content: attr(data-vpcr-tooltip);
          position: absolute;
          bottom: 135%;
          left: 50%;
          background: #0f172a;
          color: #f8fafc;
          padding: 2px 6px;
          border-radius: 2px;
          font-size: 8px;
          font-weight: 500;
          font-family: system-ui, -apple-system, sans-serif;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          transform: translateX(-50%) translateY(8px) scale(0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .vpcr-btn:hover::after {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
        .vpcr-modal-overlay {
          position: fixed;
          inset: 0;
          background: transparent;
          z-index: 999999999;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 60px;
          box-sizing: border-box;
          opacity: 0;
          pointer-events: none;
          transition: all 0.3s ease;
        }
        .vpcr-modal-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }
        .vpcr-modal-card {
          background: #000000;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          padding: 24px 32px;
          width: 80%;
          max-width: 600px;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          position: relative;
          box-sizing: border-box;
          transform: scale(0.9) translateY(20px);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          overflow: hidden;
        }
        .vpcr-modal-overlay.open .vpcr-modal-card {
          transform: scale(1) translateY(0);
        }
        .vpcr-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 18px;
          cursor: pointer;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s ease;
          padding: 0;
        }
        .vpcr-modal-close:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.08);
        }
        .vpcr-modal-wave {
          font-size: 40px;
          margin-bottom: 16px;
          display: inline-block;
          animation: vpcr-wave 1.5s infinite ease-in-out;
          transform-origin: 70% 70%;
        }
        .vpcr-modal-title {
          font-family: 'Caveat', cursive, system-ui, -apple-system, sans-serif;
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 12px;
          line-height: 1.2;
          color: #a78bfa;
        }
        .vpcr-modal-desc {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .vpcr-modal-link {
          display: block;
          margin-top: 16px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          color: #a78bfa;
          text-decoration: none;
          opacity: 0.8;
          transition: opacity 0.2s ease;
        }
        .vpcr-modal-link:hover {
          opacity: 1;
          text-decoration: underline;
        }
        .vpcr-modal-logo-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
        }
        .vpcr-logo-img {
          height: 24px;
          object-fit: contain;
          filter: drop-shadow(0 0 8px rgba(167, 139, 250, 0.2));
        }
        .vpcr-logo-divider {
          color: #64748b;
          font-weight: 500;
          font-size: 16px;
          font-family: system-ui, -apple-system, sans-serif;
        }
        @keyframes vpcr-wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-15deg); }
          50% { transform: rotate(20deg); }
          75% { transform: rotate(-5deg); }
        }
        @keyframes vpcr-pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.6); }
          70% { box-shadow: 0 0 0 10px rgba(167, 139, 250, 0); }
          100% { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0); }
        }
      \`;
      document.head.appendChild(style);

      let overlay = null;
      let tooltip = null;
      let lastTarget = null;
      let isAltDown = false;
      let isInspectActive = false;
      let btn = null;
      let infoBtn = null;
      let modal = null;
      let dock = null;

      function isModeActive() {
        return isAltDown || isInspectActive;
      }

      function createUI() {
        if (!enableHighlighter) return;
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
        if (!target || !enableHighlighter) return;
        
        createUI();
        const rect = target.getBoundingClientRect();
        const refId = target.getAttribute('${prefix}-id');
        let componentName = target.getAttribute('${prefix}-component');
        const [file, line, comp] = refId.split(':');
        
        if (!componentName && comp) {
          componentName = comp;
        }
        componentName = componentName || 'Component';
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

      function updateBtnState() {
        if (!btn) return;
        if (isModeActive()) {
          btn.classList.add('active');
          btn.setAttribute('data-vpcr-tooltip', 'Exit Inspection (Alt)');
          if (dock) dock.classList.add('active');
        } else {
          btn.classList.remove('active');
          btn.setAttribute('data-vpcr-tooltip', 'Inspect Component (Alt)');
          if (dock) dock.classList.remove('active');
        }
      }

      function initUI() {
        if (!document.body) {
          window.addEventListener('DOMContentLoaded', initUI);
          return;
        }
        
        dock = document.createElement('div');
        dock.className = 'vpcr-dock';

        const triggerDiv = document.createElement('div');
        triggerDiv.className = 'vpcr-dock-trigger';
        triggerDiv.innerHTML = viteLogo || vpcrLogo ? \`<img class="vpcr-dock-trigger-logo" src="\${vpcrLogo || viteLogo}" alt="VPCR" />\` : 'Ref';

        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'vpcr-dock-buttons';

        infoBtn = document.createElement('button');
        infoBtn.className = 'vpcr-btn';
        infoBtn.setAttribute('data-vpcr-tooltip', 'About VPCR');
        infoBtn.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-question-mark-icon lucide-circle-question-mark"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>\`;
        
        btn = document.createElement('button');
        btn.className = 'vpcr-btn';
        btn.setAttribute('data-vpcr-tooltip', 'Inspect Component (Alt)');
        btn.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-dashed-mouse-pointer-icon lucide-square-dashed-mouse-pointer"><path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/><path d="M21 9v2"/><path d="M3 14v1"/></svg>\`;

        buttonsDiv.appendChild(infoBtn);
        buttonsDiv.appendChild(btn);

        dock.appendChild(triggerDiv);
        dock.appendChild(buttonsDiv);
        document.body.appendChild(dock);

        let dockTimeout = null;
        dock.addEventListener('mouseenter', () => {
          if (dockTimeout) {
            clearTimeout(dockTimeout);
            dockTimeout = null;
          }
          dock.classList.add('expanded');
        });
        dock.addEventListener('mouseleave', () => {
          if (dockTimeout) clearTimeout(dockTimeout);
          dockTimeout = setTimeout(() => {
            if (!isInspectActive) {
              dock.classList.remove('expanded');
            }
          }, 20000); // 20 seconds!
        });

        modal = document.createElement('div');
        modal.className = 'vpcr-modal-overlay';
        modal.innerHTML = \`
          <div class="vpcr-modal-card">
            <button class="vpcr-modal-close">&times;</button>
            <span class="vpcr-modal-wave">👋</span>
            <h3 class="vpcr-modal-title">Hi there, welcome to VPCR!</h3>
            <div class="vpcr-modal-logo-row">
              \${viteLogo ? \`<img class="vpcr-logo-img" src="\${viteLogo}" alt="Vite" />\` : ''}
              <span class="vpcr-logo-divider">+</span>
              \${vpcrLogo ? \`<img class="vpcr-logo-img" src="\${vpcrLogo}" alt="VPCR" />\` : ''}
            </div>
            <p class="vpcr-modal-desc">
              VPCR is a set of visual tools that help you to know your Vite app better, and enhance your development experience with Vite. Enjoy!
            </p>
            <a href="https://vpcr.vercel.app" target="_blank" class="vpcr-modal-link">Learn more at vpcr.vercel.app ↗</a>
          </div>
        \`;
        document.body.appendChild(modal);

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          isInspectActive = !isInspectActive;
          updateBtnState();
          if (!isInspectActive) {
            removeUI();
          }
        });

        infoBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          modal.classList.add('open');
        });

        const closeModal = () => {
          modal.classList.remove('open');
        };
        modal.querySelector('.vpcr-modal-close').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });
      }

      initUI();

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Alt') {
          isAltDown = true;
          updateBtnState();
        } else if (e.key === 'Escape' && isInspectActive) {
          isInspectActive = false;
          updateBtnState();
          removeUI();
        }
      }, true);

      window.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') {
          isAltDown = false;
          updateBtnState();
          if (!isInspectActive) {
            removeUI();
          }
        }
      }, true);

      window.addEventListener('blur', () => {
        isAltDown = false;
        updateBtnState();
        if (!isInspectActive) {
          removeUI();
        }
      }, true);

      window.addEventListener('mousemove', (e) => {
        // Safety check: if alt key is not pressed but we think it is, reset
        if (isAltDown && !e.altKey) {
          isAltDown = false;
          updateBtnState();
          if (!isInspectActive) {
            removeUI();
            return;
          }
        }

        if (!isModeActive()) return;

        // Skip highlighting if hovering over the dock itself or the welcome modal
        if (e.target.closest('.vpcr-dock') || e.target.closest('.vpcr-modal-overlay')) {
          removeUI();
          return;
        }
        
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
        if (isModeActive() && lastTarget) {
          updateUI(lastTarget);
        }
      }, true);

      // Click Handler
      const handleClick = (e) => {
        if (e.target.closest('.vpcr-dock') || e.target.closest('.vpcr-modal-overlay')) {
          return;
        }

        if (e.altKey || isInspectActive) {
          const taggedElement = e.target.closest('[${prefix}-id]');
          if (taggedElement) {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            const refId = taggedElement.getAttribute('${prefix}-id');
            const [file, line] = refId.split(':');
            fetch('/__open-in-editor?file=' + encodeURIComponent(file) + '&line=' + line);
            
            // Audio feedback
            // playPop();

            // Visual feedback
            if (overlay) {
              overlay.style.backgroundColor = 'rgba(34, 211, 238, 0.4)';
              setTimeout(() => {
                if (overlay) overlay.style.backgroundColor = 'rgba(34, 211, 238, 0.15)';
              }, 150);
            }

            // Deactivate inspection after successful selection/navigation
            if (isInspectActive) {
              isInspectActive = false;
              updateBtnState();
              setTimeout(() => {
                removeUI();
              }, 200);
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
      if (env.VPCR_EDITOR) {
        process.env.VPCR_EDITOR = env.VPCR_EDITOR;
      }
    },

    configureServer(server) {
      // Proactive background editor scanning to completely eliminate the first-click powershell scanning delay on Windows!
      if (!options.openInEditor && !process.env.VPCR_EDITOR && !editor) {
        setTimeout(() => {
          try {
            if (process.env.ANTIGRAVITY_EDITOR_APP_ROOT) {
              process.env.VPCR_EDITOR = "antigravity";
            } else {
              const guessEditor = require("launch-editor/guess");
              const guessed = guessEditor();
              if (guessed && guessed[0]) {
                process.env.VPCR_EDITOR = guessed[0];
              }
            }
          } catch (e) {
            // Silently ignore background scanning errors
          }
        }, 100);
      }

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
                const targetEditor = process.env.VPCR_EDITOR || editor;
                let cmdTemplate = targetEditor;
                let isAntigravityIDE = false;

                // Auto-detect Antigravity IDE if no editor specified, or if editor is explicitly set to antigravity
                if (process.env.ANTIGRAVITY_EDITOR_APP_ROOT && (!cmdTemplate || cmdTemplate.toLowerCase().includes("antigravity"))) {
                  isAntigravityIDE = true;
                }

                if (isAntigravityIDE) {
                  const appRoot = process.env.ANTIGRAVITY_EDITOR_APP_ROOT as string;
                  const exePath = path.resolve(appRoot, "../../Antigravity IDE.exe");
                  const cliPath = path.resolve(appRoot, "out/cli.js");
                  const execEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };

                  // High-performance direct spawn bypasses cmd.exe shell entirely, launching editor instantly!
                  const child = spawn(exePath, [cliPath, "-g", `${absolutePath}:${lineNum}`], {
                    detached: true,
                    stdio: 'ignore',
                    env: execEnv
                  });
                  child.unref();
                } else if (cmdTemplate) {
                  // Smart defaults for known editors
                  const vsCodeEditors = [
                    "cursor", "cursor-nightly", "code", "code-insiders",
                    "vscodium", "codium", "codium-insiders", "windsurf",
                    "pearai", "trae", "code-server", "qoder", "kiro",
                    "kirio", "antigravity", "agy", "positron"
                  ];
                  const normalizedEditor = (targetEditor || "").toLowerCase();
                  const isVSCodeBase = vsCodeEditors.includes(normalizedEditor) || vsCodeEditors.some(ed => normalizedEditor.endsWith(ed));

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

                    exec(finalCommand, { env: process.env }, (err) => {
                      if (err) console.error(`[vpcrTagger] Command failed: ${finalCommand}`, err);
                    });
                  } else {
                    launchEditor(`${absolutePath}:${lineNum}`, targetEditor);
                  }
                } else {
                  launchEditor(`${absolutePath}:${lineNum}`);
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
          if (attributes.includes("id")) attrsToAdd.push(jsxAttr(`${prefix}-id`, `${relPath}:${line}:${componentName}`));
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

export { vpcrTagger as componentRefTagger };

