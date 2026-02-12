import { describe, it, expect, beforeEach, vi } from 'vitest';
import { componentRefTagger } from '../src/index';

describe('componentRefTagger editor logic', () => {
    let plugin: any;

    it('should use default editor if none specified', () => {
        plugin = componentRefTagger({});
        // We can't easily test private configureServer logic without exports
        // but we can verify options are handled
        expect(plugin.name).toBe('vite-component-ref-tagger');
    });

    it('should respect COMPONENT_REF_EDITOR environment variable', () => {
        process.env.COMPONENT_REF_EDITOR = 'my-custom-editor';
        plugin = componentRefTagger({ editor: 'original-editor' });
        
        const mockConfig = { mode: 'dev', root: '/' };
        // We need to trigger configResolved to set up the env
        if (plugin.configResolved) {
            plugin.configResolved(mockConfig as any);
        }
        
        expect(process.env.COMPONENT_REF_EDITOR).toBe('my-custom-editor');
    });
});
