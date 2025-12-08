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
    
    // Excluir arquivos de teste e configuração do build
    config.module.rules.push({
      test: /(vitest\.config\.ts|\.test\.ts|\.spec\.ts)$/,
      use: 'ignore-loader',
    });
    
    // Excluir pasta uploads do bundle (arquivos de usuário não devem ser incluídos)
    // Isso previne que arquivos de upload sejam incluídos no bundle do serverless function
    config.module.rules.push({
      test: /uploads\/projects\/.*/,
      use: 'ignore-loader',
    });
    
    // Otimizar resolução de módulos
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    // No servidor, configurar módulos nativos do WebSocket e excluir uploads
    if (isServer) {
      const webpack = require('webpack');
      const path = require('path');
      
      // Marcar ws e módulos relacionados como externos para usar versões nativas do Node.js
      // Isso evita problemas de compatibilidade com WebSocket no servidor
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('bufferutil', 'utf-8-validate');
      }
      
      // Inicializar plugins se não existir
      config.plugins = config.plugins || [];
      
      // Adicionar plugin para ignorar imports de uploads (previne inclusão no bundle)
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^\.\/uploads/,
          contextRegExp: /uploads/,
        })
      );
      
      // Ignorar módulos opcionais do ws que podem não estar instalados
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^bufferutil$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^utf-8-validate$/,
        })
      );
    }

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

