const { componentRefTagger } = require('./dist/index.js');
const fs = require('fs');

const plugin = componentRefTagger({
    prefix: 'ref',
    basePath: 'page',
    include: ['.tsx'],
});

const mockConfig = { command: 'serve', root: 'F:/npm-packages/component-referrance-tagger/playground' };
if (plugin.configResolved) {
    plugin.configResolved(mockConfig);
}

const transform = plugin.transform;

const code = `import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div className="counter-container">
      <h3>Counter Component</h3>
      <button onClick={() => setCount((c) => c + 1)}>
        Count is: {count}
      </button>
    </div>
  )
}
`;

const id = 'F:/npm-packages/component-referrance-tagger/playground/page/Counter.tsx';

try {
    const result = transform(code, id);
    fs.writeFileSync('output.txt', result);
    console.log('Successfully wrote to output.txt');
} catch (error) {
    fs.writeFileSync('output.txt', error.stack);
}
