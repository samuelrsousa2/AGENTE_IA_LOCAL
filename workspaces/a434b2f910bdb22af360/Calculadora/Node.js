import { Config } from 'https://cdn.jsdelivr.net/npm/@nest/next/dist/cdn@latest.01.0/syndes/config.json';

// Cria a configuração básica do Node.js
const nodeConfig = new Config({
  require: (req) => req.config({ ...Config.readFile('node.config.js') }),
});

export const useNodeConfig = () => {
  return { config: nodeConfig };
};
