#!/usr/bin/env node

/**
 * Comprehensive validation script for the DSH HMCL-MCP plugin.
 */

import fs from 'fs';
import path from 'path';
import { PLUGIN_ROOT } from './lib/paths.js';

console.log('Validating DSH HMCL-MCP plugin...');

// Check plugin structure
const pluginDir = PLUGIN_ROOT;
const requiredFiles = [
  'package.json',
  'host.js',
  'cordis.patch.yml',
  'lib/mcp-client.js',
  'lib/tools.js',
  'README.md'
];

console.log('\n--- Checking plugin structure ---');
for (const file of requiredFiles) {
  const filePath = path.join(pluginDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`✓ ${file} exists`);
  } else {
    console.log(`✗ ${file} missing`);
    process.exit(1);
  }
}

// Check package.json structure
console.log('\n--- Checking package.json ---');
const packageJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'));
const requiredFields = ['name', 'version', 'type', 'main', 'exports', 'dsh'];
for (const field of requiredFields) {
  if (packageJson[field]) {
    console.log(`✓ package.json has ${field}`);
  } else {
    console.log(`✗ package.json missing ${field}`);
    process.exit(1);
  }
}

// Check host.js exports
console.log('\n--- Checking host.js exports ---');
const hostJs = fs.readFileSync(path.join(pluginDir, 'host.js'), 'utf8');
const requiredExports = ['name', 'inject', 'Config', 'apply'];
for (const exp of requiredExports) {
  if (hostJs.includes(`export const ${exp}`) || hostJs.includes(`export function ${exp}`)) {
    console.log(`✓ host.js exports ${exp}`);
  } else {
    console.log(`✗ host.js missing export ${exp}`);
    process.exit(1);
  }
}

// Check MCP client structure
console.log('\n--- Checking MCP client ---');
const mcpClient = fs.readFileSync(path.join(pluginDir, 'lib/mcp-client.js'), 'utf8');
const mcpMethods = ['start', 'stop', 'initialize', 'listTools', 'callTool'];
for (const method of mcpMethods) {
  if (mcpClient.includes(method)) {
    console.log(`✓ MCP client has ${method} method`);
  } else {
    console.log(`✗ MCP client missing ${method} method`);
    process.exit(1);
  }
}

// Check tools registration
console.log('\n--- Checking tools registration ---');
const toolsJs = fs.readFileSync(path.join(pluginDir, 'lib/tools.js'), 'utf8');
const expectedTools = [
  'hmcl_check_environment',
  'hmcl_list_versions',
  'hmcl_search_mods',
  'hmcl_build_modpack'
];

for (const tool of expectedTools) {
  if (toolsJs.includes(tool)) {
    console.log(`✓ Tool ${tool} defined`);
  } else {
    console.log(`✗ Tool ${tool} missing`);
    process.exit(1);
  }
}

// Check cordis patch
console.log('\n--- Checking cordis patch ---');
const cordisPatch = fs.readFileSync(path.join(pluginDir, 'cordis.patch.yml'), 'utf8');
if (cordisPatch.includes('id: hmcl-mcp') && cordisPatch.includes('name: dsh-hmcl-mcp')) {
  console.log('✓ cordis.patch.yml has correct insert entry');
} else {
  console.log('✗ cordis.patch.yml missing correct insert entry');
  process.exit(1);
}

// Check HMCL-MCP JAR exists
console.log('\n--- Checking HMCL-MCP JAR ---');
// Check HMCL-MCP JAR exists. The jar is a large binary and is NOT shipped with
// the repository — place it next to package.json or point HMCL_MCP_JAR at it.
const jarPath = process.env.HMCL_MCP_JAR
  ? path.resolve(process.env.HMCL_MCP_JAR)
  : path.join(pluginDir, 'hmcl-mcp.jar');
if (fs.existsSync(jarPath)) {
  console.log(`✓ HMCL-MCP JAR exists at ${jarPath}`);
} else {
  console.log(`! HMCL-MCP JAR not found at ${jarPath} — place hmcl-mcp.jar there or set HMCL_MCP_JAR`);
}

// Check Java availability
console.log('\n--- Checking Java availability ---');
const { spawnSync } = await import('node:child_process');
const javaResult = spawnSync('java', ['-version']);
if (javaResult.status === 0) {
  console.log('✓ Java is available');
} else {
  console.log('✗ Java not available');
  process.exit(1);
}

console.log('\n✅ All validations passed!');
console.log('\nPlugin is ready for use in DSH environment.');
console.log('Next steps:');
console.log('1. Restart DSH Desktop to load the plugin');
console.log('2. Test the tools in the DSH GUI');
console.log('3. Verify autonomous modpack building with hmcl_build_modpack');