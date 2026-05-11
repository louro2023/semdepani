module.exports = {
  apps: [
    {
      name: 'semdepani',
      script: 'server/index.js',
      interpreter: 'node',
      interpreter_args: '--disable-warning=ExperimentalWarning --env-file=.env',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
        LISTEN_HOST: '0.0.0.0'
      }
    }
  ]
};
