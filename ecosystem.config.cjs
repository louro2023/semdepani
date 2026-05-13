module.exports = {
  apps: [
    {
      name: 'semdepani',
      script: 'server/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      interpreter: 'node',
      interpreter_args: '--disable-warning=ExperimentalWarning --env-file=.env',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        LISTEN_HOST: '0.0.0.0'
      }
    }
  ]
};
