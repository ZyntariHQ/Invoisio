import path from 'path'

/** @type {import('next').NextConfig} */
const projectRoot = process.cwd()
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Optional native-only deps (alias to empty stub to avoid runtime factory errors)
      '@react-native-async-storage/async-storage': path.resolve(projectRoot, 'stubs/empty.js'),
      'pino-pretty': path.resolve(projectRoot, 'stubs/empty.js'),
      // (removed wagmi connector stubs so real connectors can be used without warnings)

      // Extra safety for nested deps
      '@metamask/sdk': path.resolve(projectRoot, 'stubs/empty.js'),
      '@walletconnect/ethereum-provider': path.resolve(projectRoot, 'stubs/empty.js'),
      '@walletconnect/universal-provider': path.resolve(projectRoot, 'stubs/empty.js'),
      '@walletconnect/logger': path.resolve(projectRoot, 'stubs/empty.js'),
    }
    return config
  },
}

export default nextConfig
