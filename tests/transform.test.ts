import { describe, it, expect, beforeEach } from 'vitest';
import { componentRefTagger } from '../src/index';
import * as path from 'path';

describe('componentRefTagger transformation', () => {
    let plugin: any;

    beforeEach(() => {
        plugin = componentRefTagger({
            prefix: 'ref',
            basePath: 'src',
            include: ['.tsx', '.jsx'],
        });
        
        // Mock configResolved
        if (plugin.configResolved) {
            plugin.configResolved({
                command: 'serve',
                root: '/project',
            } as any);
        }
    });

    it('should tag a simple functional component', () => {
        const code = `
            export function MyComponent() {
                return <div>Hello</div>;
            }
        `;
        const id = '/project/src/MyComponent.tsx';
        const result = plugin.transform(code, id);

        expect(result).toContain('ref-id="src/MyComponent.tsx:3"');
        expect(result).toContain('ref-component="MyComponent"');
        expect(result).toContain('ref-name="div"');
    });

    it('should tag nested elements', () => {
        const code = `
            export function MyComponent() {
                return (
                    <div>
                        <span>Nested</span>
                    </div>
                );
            }
        `;
        const id = '/project/src/MyComponent.tsx';
        const result = plugin.transform(code, id);

        expect(result).toContain('ref-id="src/MyComponent.tsx:4"');
        expect(result).toContain('ref-id="src/MyComponent.tsx:5"');
    });

    it('should skip files not in include list', () => {
        const code = `export const x = 1;`;
        const id = '/project/src/styles.css';
        const result = plugin.transform(code, id);

        expect(result).toBeNull();
    });

    it('should honor exclude list', () => {
        const code = `export function Main() { return <div />; }`;
        const id = '/project/src/main.tsx';
        const result = plugin.transform(code, id);

        expect(result).toBeNull();
    });

    it('should handle export default components', () => {
        const code = `
            export default function App() {
                return <div>App</div>;
            }
        `;
        const id = '/project/src/App.tsx';
        const result = plugin.transform(code, id);

        expect(result).toContain('ref-component="App"');
    });
});
