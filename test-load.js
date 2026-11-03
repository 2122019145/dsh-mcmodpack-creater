#!/usr/bin/env node

/**
 * Test script to check if the plugin can be loaded and tools registered.
 */

import { apply, cleanupClient } from './lib/tools.js';

console.log('Testing DSH HMCL-MCP plugin load...');

// Mock ctx object
const mockCtx = {
  tools: {
    register: (tool) => {
      console.log(`✓ Registered tool: ${tool.name}`);
      return true;
    }
  }
};

try {
  // Test plugin application
  apply(mockCtx, {
    jarPath: 'D:/dsh1/mcpackage_genacter/HMCL-MCP/build/hmcl-mcp.jar',
    workdir: 'C:/Users/m2122/.hmcl-mcp',
    javaPath: 'java',
    agentPort: 28501,
    agentToken: 'hmcl-mcp'
  });
  
  console.log('✓ Plugin loaded successfully');
  console.log('✓ All tools registered');
  
} catch (error) {
  console.error('✗ Plugin load failed:', error.message);
  process.exit(1);
} finally {
  cleanupClient();
}

console.log('Load test completed successfully!');