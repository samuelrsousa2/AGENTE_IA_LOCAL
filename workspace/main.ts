import * as fs from 'fs';
import * as path from 'path';

interface LoginOptions {
  username: string;
  password: string;
}

const loginOptions: LoginOptions = {
  username: '',
  password: ''
};

function createFile(filePath: string) {
  try {
    const contents = "Olá, mundo!";
    fs.writeFileSync(filePath, contents);
    console.log(`File created: ${filePath}`);
  } catch (error) {
    console.error(error);
  }
}

function listFiles() {
  try {
    const files = fs.readdirSync('./');
    return files;
  } catch (error) {
    console.error(error);
    return [];
  }
}

function read_file(filePath: string) {
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    return contents;
  } catch (error) {
    console.error(error);
    return '';
  }
}

function run_command(options: LoginOptions) {
  try {
    if (options.username && options.password) {
      // Run command to install packages
      process.env.NPM_TOKEN = `Bearer ${options.password}`;
      const childProcess = require('child_process');
      childProcess.execSync(`npm install`);
    }
  } catch (error) {
    console.error(error);
  }
}

function main() {
  while (true) {
    console.log("\n1. Criar arquivo");
    console.log("2. Listar arquivos");
    console.log("3. Ler arquivo");
    console.log("4. Sair");

    const choice = parseInt(read_file('input.txt')) as number;

    switch (choice) {
      case 1:
        createFile('login.html');
        break;
      case 2:
        listFiles();
        break;
      case 3:
        read_file('login.html');
        break;
      case 4:
        process.exit(0);
      default:
        console.log("Invalid choice. Please try again.");
    }
  }
}

main();
