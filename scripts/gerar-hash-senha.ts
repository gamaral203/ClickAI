// Gera o hash (scrypt) de uma senha para a variável GESTORES, sem a senha sair desta máquina.
// Uso: npm run senha:hash  (a senha é pedida no terminal e não aparece na tela)

import { createInterface } from "node:readline";

import { gerarHashSenha } from "../src/lib/senha";

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
// Não ecoa o que é digitado.
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
  if (s.startsWith("Senha")) process.stdout.write(s);
};
rl.question("Senha: ", (senha) => {
  rl.close();
  process.stdout.write("\n");
  if (senha.length < 8) {
    console.error("Use pelo menos 8 caracteres.");
    process.exit(1);
  }
  console.log(gerarHashSenha(senha));
});
