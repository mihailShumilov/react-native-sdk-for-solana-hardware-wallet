const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// Monorepo root
const monorepoRoot = path.resolve(__dirname, '../..');
const packagesDir = path.resolve(monorepoRoot, 'packages');

// Map workspace package names to their source directories
const workspacePackages = {
  '@solana-hw-wallet/shared': path.resolve(packagesDir, 'shared'),
  '@solana-hw-wallet/core': path.resolve(packagesDir, 'core'),
  '@solana-hw-wallet/solana': path.resolve(packagesDir, 'solana'),
  '@solana-hw-wallet/transports': path.resolve(packagesDir, 'transports'),
  '@solana-hw-wallet/adapter-ledger': path.resolve(packagesDir, 'adapter-ledger'),
  '@solana-hw-wallet/adapter-keystone': path.resolve(packagesDir, 'adapter-keystone'),
  '@solana-hw-wallet/adapter-trezor': path.resolve(packagesDir, 'adapter-trezor'),
  '@solana-hw-wallet/adapter-safepal': path.resolve(packagesDir, 'adapter-safepal'),
  '@solana-hw-wallet/react-native': path.resolve(packagesDir, 'react-native'),
  '@solana-hw-wallet/test-utils': path.resolve(packagesDir, 'test-utils'),
};

// Build extraNodeModules so Metro resolves @solana-hw-wallet/* to local packages
const extraNodeModules = {};
for (const [name, packagePath] of Object.entries(workspacePackages)) {
  extraNodeModules[name] = packagePath;
}

const config = {
  // Watch the entire monorepo so changes in workspace packages are picked up
  watchFolders: [monorepoRoot],

  resolver: {
    // Map workspace packages to their local paths
    extraNodeModules: {
      ...extraNodeModules,
      // Also ensure common deps resolve from the monorepo root node_modules
      react: path.resolve(monorepoRoot, 'node_modules/react'),
      'react-native': path.resolve(monorepoRoot, 'node_modules/react-native'),
    },
    // Ensure Metro resolves node_modules from both the app and monorepo root
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
