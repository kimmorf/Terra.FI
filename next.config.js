/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Configuração para resolver problemas de cache do webpack
  webpack: (config, { isServer }) => {
    // Ignorar warnings sobre vendor-chunks ausentes (problema conhecido do Next.js)
    config.ignoreWarnings = [
      { module: /vendor-chunks/ },
      { file: /vendor-chunks/ },
    ];
    
    // Otimizar resolução de módulos
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    return config;
  },
  // Configuração experimental para melhorar o build
  experimental: {
    // Otimizar cache do webpack
    webpackBuildWorker: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/elysia/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

