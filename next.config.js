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
      
      // Adicionar alias para garantir que os stubs sejam encontrados
      config.resolve.alias = {
        ...config.resolve.alias,
        'bufferutil': path.resolve(__dirname, 'lib/utils/bufferutil-stub.js'),
        'utf-8-validate': path.resolve(__dirname, 'lib/utils/utf8-validate-stub.js'),
      };
      
      // Inicializar plugins se não existir
      config.plugins = config.plugins || [];
      
      // Adicionar plugin para ignorar imports de uploads (previne inclusão no bundle)
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^\.\/uploads/,
          contextRegExp: /uploads/,
        })
      );
      
      // Substituir módulos opcionais do ws por stubs
      // Isso evita que o webpack tente processar código que referencia esses módulos
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^bufferutil$/,
          path.resolve(__dirname, 'lib/utils/bufferutil-stub.js')
        ),
        new webpack.NormalModuleReplacementPlugin(
          /^utf-8-validate$/,
          path.resolve(__dirname, 'lib/utils/utf8-validate-stub.js')
        )
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

