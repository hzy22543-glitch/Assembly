// Archived PM2 configuration. Use ecosystem.config.cjs from the repository root.
module.exports = {
  apps: [
    {
      name: 'codebuddy-api',
      script: 'server/server.js',
      cwd: '.',
      env: {
        PORT: 3001,
        SANDBOX_URL: 'http://127.0.0.1:5000'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'codebuddy-web',
      script: 'node_modules/http-server/bin/http-server',
      args: 'dist -p 80 -a 0.0.0.0',
      cwd: '.',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    },
    {
      name: 'asm-sandbox',
      script: 'sandbox/start_sandbox.bat',
      cwd: '.',
      env: {
        SANDBOX_PORT: 5000,
        SANDBOX_HOST: '0.0.0.0'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    }
  ]
};
