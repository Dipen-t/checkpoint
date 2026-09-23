import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnderstandingEngine } from '../src/engines/understanding/index.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('Bootstrap / Baseline Mode', () => {
  const testRoot = path.join(process.cwd(), 'test-folders', 'bootstrap-test');

  beforeEach(async () => {
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(path.join(testRoot, 'package.json'), JSON.stringify({
      dependencies: {
        "express": "latest"
      }
    }));
    await fs.mkdir(path.join(testRoot, 'src'), { recursive: true });
    // Write a sample file to test code consistency scanning (uses semicolons and double quotes)
    await fs.writeFile(path.join(testRoot, 'src', 'index.ts'), 'const x = "hello";\n'.repeat(15));
  });

  afterEach(async () => {
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('UnderstandingEngine scans project and infers consistency correctly', async () => {
    const engine = new UnderstandingEngine();
    const context = await engine.scanWorkspace(testRoot);
    
    expect(context.frameworks).toContain('Express');
    
    // Check code consistency inference
    expect(context.codeConsistency).toContain('Uses semicolons.');
    expect(context.codeConsistency).toContain('Prefers double quotes for strings.');
  });
});
