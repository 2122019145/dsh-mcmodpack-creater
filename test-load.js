#!/usr/bin/env node

/**
 * Test script to check if the plugin can be loaded and tools registered.
 */

import path from 'node:path';
import { apply, cleanupClient } from './lib/tools.js';
import { PLUGIN_ROOT } from './lib/paths.js';

// Portable defaults: the jar lives next to package.json unless overridden.
const jarPath = process.env.HMCL_MCP_JAR || path.join(PLUGIN_ROOT, 'hmcl-mcp.jar');
const workdir = process.env.HMCL_MCP_WORKDIR || '~/.hmcl-mcp';

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
    jarPath,
    workdir,
    javaPath: process.env.HMCL_MCP_JAVA || 'java',
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