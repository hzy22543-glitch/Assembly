module.exports = {
  apps: [
    {
      name: 'codebuddy-flask',
      script: 'sandbox/api_endpoint.py',
      interpreter: 'python',
      args: '',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: __dirname + '/logs/flask-error.log',
      out_file: __dirname + '/logs/flask-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'codebuddy-server',
      script: 'server/server.js',
      exec_mode: 'fork',
      node_args: '--no-warnings',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: __dirname + '/logs/server-error.log',
      out_file: __dirname + '/logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};
