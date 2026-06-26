import { Config } from 'https://cdn.jsdelivr.net/npm/@nest/next/dist/cdn@latest.01.0/syndes/config.json';

const useNodeConfig = () => {
  return new Config({
    require: (req) => req.config({ ...Config.readFile('node.config.js') }),
  });
};
