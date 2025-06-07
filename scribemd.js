import { Lexer } from "./lexer.js";
import Parser from "./parser.js";

const editor = document.querySelector('#editor');
const output = document.querySelector('#output');
const raw = document.querySelector('#raw');
const html = document.querySelector('#html');
const toks = document.querySelector('#toks');
const none = document.querySelector('#none');

function update() {
  console.log('update');
  const lexer = new Lexer(editor.value);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const dom = ast.html();
  output.textContent = JSON.stringify(ast, null, 1);
  raw.textContent = dom;
  html.innerHTML = dom;
  toks.textContent = JSON.stringify(tokens, null, 1);
}

editor.addEventListener('input', update);
update();
