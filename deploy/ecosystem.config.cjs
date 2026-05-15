module.exports = {
  apps: [
    {
      name: 'todo-backend',
      cwd: './node',
      script: 'dist/server.js',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'todo-frontend',
      cwd: './react',
      script: '/usr/bin/serve',
      args: '-s dist -l 5173',
      interpreter: 'none',
      autorestart: true,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
