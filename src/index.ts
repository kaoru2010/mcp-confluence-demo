console.log("Hello, TypeScript project!");

interface Config {
  name: string;
  version: string;
}

const config: Config = {
  name: "mcp-confluence-demo",
  version: "1.0.0",
};

console.log(`Project: ${config.name} v${config.version}`);
