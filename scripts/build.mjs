// Do not let a developer's .env turn the production bundle into a development build.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();
