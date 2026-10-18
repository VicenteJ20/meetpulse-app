#!/usr/bin/env node
/**
 * Auto-detect GPU and run Tauri with appropriate features
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Get the command (dev or build)
const command = process.argv[2];
if (!command || !['dev', 'build'].includes(command)) {
  console.error('Usage: node tauri-auto.js [dev|build]');
  process.exit(1);
}

// Detect GPU feature
let feature = '';

// Check for environment variable override first
if (process.env.TAURI_GPU_FEATURE) {
  feature = process.env.TAURI_GPU_FEATURE;
  console.log(`🔧 Using forced GPU feature from environment: ${feature}`);
} else {
  try {
    const result = execSync('node scripts/auto-detect-gpu.js', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit']
    });
    feature = result.trim();
  } catch (err) {
    // If detection fails, continue with no features
  }
}

console.log(''); // Empty line for spacing

// Platform-specific environment variables
const platform = os.platform();
const env = { ...process.env };

if (platform === 'linux' && feature === 'cuda') {
  console.log('🐧 Linux/CUDA detected: Setting CMAKE flags for NVIDIA GPU');
  env.CMAKE_CUDA_ARCHITECTURES = '75';
  env.CMAKE_CUDA_STANDARD = '17';
  env.CMAKE_POSITION_INDEPENDENT_CODE = 'ON';
}

// El resumen con IA integrada corre en un proceso aparte (llama-helper). Si no se compila con el mismo
// backend de GPU, el modelo se carga en RAM y CPU aunque la app esté compilada con CUDA o Vulkan.
const helperFeature = { cuda: 'cuda', vulkan: 'vulkan', coreml: 'metal', metal: 'metal' }[feature];
if (helperFeature) {
  const profile = command === 'build' ? ' --release' : '';
  console.log(`🧠 Building llama-helper with ${helperFeature} so built-in AI models use the GPU`);
  try {
    execSync(`cargo build -p llama-helper --features ${helperFeature}${profile}`, {
      stdio: 'inherit',
      env,
      cwd: path.join(__dirname, '..', '..'),
    });
  } catch (err) {
    console.error('⚠️  llama-helper could not be built with GPU support; built-in AI will run on CPU.');
  }
}

// Build the tauri command
let tauriCmd = `tauri ${command}`;
if (feature && feature !== 'none') {
  tauriCmd += ` -- --features ${feature}`;
  console.log(`🚀 Running: tauri ${command} with features: ${feature}`);
} else {
  console.log(`🚀 Running: tauri ${command} (CPU-only mode)`);
}
console.log('');

// Execute the command
try {
  execSync(tauriCmd, { stdio: 'inherit', env });
} catch (err) {
  process.exit(err.status || 1);
}
