class ParseError extends Error {}

class Buffer {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  next() {
    return this.tokens[this.index++];
  }

  peek() {
    return this.tokens.slice(this.index, this.index+1)[0];
  }

  expect(expected) {
    let found = this.next();
    if (expected instanceof RegExp) {
      if (!expected.test(found?.val)) {
        throw new ParseError(`Expected token "${expected.source}", found "${found?.val ?? 'EOF'}"`);
      }
    } else {
      if (found?.val !== expected) {
        throw new ParseError(`Expected token "${expected}", found "${found?.val ?? 'EOF'}"`);
      }
    }

    return found;
  }

  expectAll(expected) {
    let found = '';
    if (expected instanceof RegExp) {
      while (expected.test(this.peek()?.val)) {
        found += this.expect(expected).val;
      }
    } else {
      while (this.peek()?.val === expected) {
        found += this.expect(expected).val;
      }
    }

    return found;
  }

  expectOrEOF(expected) {
    if (this.hasNext()) {
      this.expect(expected);
    }
  }

  hasNext() {
    return this.index < this.tokens.length;
  }
}

const Tok = Object.freeze({
  TEXT: 'TEXT',
  BLOCK_QUOTE: 'BLOCK_QUOTE',
  END_BLOCK_QUOTE: 'END_BLOCK_QUOTE',
  LIST_ITEM: 'LIST_ITEM',
  END_LIST_ITEM: 'END_LIST_ITEM',
  LIST: 'LIST',
  END_LIST: 'END_LIST',
  CODE_BLOCK: 'CODE_BLOCK',
  BLANK_LINE: 'BLANK_LINE',
});

class Token {
  constructor(tok, val, data) {
    this.tok = tok;
    this.val = val;
    this.data = data;
  }
}

class Lexer {
  constructor(text) {
    this.lines = text.split('\n').map((line) => line + '\n');
    this.blockQuote = 0; // The current depth of block quote nestings.
    this.lists = []; // A stack containing the indentaion levels of all current lists.
    this.indentation = 0; // The current level of indentation (for the previous line).

    this.pos = 0;
    this.chars = null;
    this.line = null;
  }

  tokenize() {
    return this.tokenizeFile();
  }

  resetContext() {
    const tokens = [];
    for (; this.blockQuote > 0; this.blockQuote--) {
      tokens.push(new Token(Tok.END_BLOCK_QUOTE, '', this.blockQuote));
    }

    while (this.lists.length > 0) {
      const list = this.lists.pop();
      tokens.push(new Token(Tok.END_LIST_ITEM, '', list.anchor));
      tokens.push(new Token(Tok.END_LIST, '', list.anchor));
    }

    this.indentation = 0;

    return tokens;
  }

  tokenizeFile() {
    const tokens = [];
    for (const line of this.lines) {
      this.line = line;
      tokens.push(...this.tokenizeLine());
    }

    tokens.push(...this.resetContext());

    return tokens;
  }

  tokenizeLine() {
    const tokens = [];

    if (this.line.trim() === '') {
      tokens.push(...this.resetContext());
      tokens.push(new Token(Tok.BLANK_LINE, ''));
      return tokens;
    }

    this.pos = 0;
    this.chars = Array.from(this.line);

    tokens.push(...this.tokenizeBlock());

    while (this.pos < this.chars.length) {
      tokens.push(new Token(Tok.TEXT, this.chars[this.pos++]));
    }

    return tokens;
  }

  tokenizeBlock() {
    const tokens = [];

    let indentation = 0;
    while (this.chars[this.pos] === ' ' && indentation < this.indentation + 4) {
      indentation++;
      this.pos++;
    }

    while (indentation < this.lists.at(-1)?.anchor) {
      const list = this.lists.pop();
      tokens.push(new Token(Tok.END_LIST_ITEM, '', list.anchor));
      tokens.push(new Token(Tok.END_LIST, '', list.anchor));
    }

    if (indentation === this.indentation + 4) {
      let text = '';
      while (this.pos < this.chars.length) {
        text += this.chars[this.pos++];
      }

      tokens.push(new Token(Tok.CODE_BLOCK, text, indentation));
    } else if (['-', '+', '*'].includes(this.chars[this.pos])) {
      const listType = this.chars[this.pos++];

      if (this.chars[this.pos] !== ' ') {
        tokens.push(new Token(Tok.TEXT, listType));
        return tokens;
      }

      let postIndentation = 0;
      while (this.chars[this.pos] === ' ' && postIndentation < 5) {
        postIndentation++;
        this.pos++;
      }

      // If there are 5 spaces, only one belongs to the list item — the rest is a code-block
      const listItemIndentation = ((postIndentation-1) % 4) + 1;
      const listIndentation = indentation + listType.length + listItemIndentation;

      // If we don't reach the list current list's item-indentation, then we're a sibling item
      if (indentation < this.lists.at(-1)?.indent) {
        tokens.push(new Token(Tok.END_LIST_ITEM, '', [indentation, this.lists.at(-1)]));
      } else { // Otherwise we're inside the current list (or there is no current list), so we open a new list
        tokens.push(new Token(Tok.LIST, '', { anchor: indentation, indent: listIndentation }));
        this.lists.push({ anchor: indentation, indent: listIndentation });
      }

      tokens.push(new Token(Tok.LIST_ITEM, listType + ' '.repeat(listItemIndentation), { anchor: indentation, indent: listIndentation }));

      if (postIndentation === 5) {
        let text = '';
        while (this.pos < this.chars.length) {
          text += this.chars[this.pos++];
        }

        tokens.push(new Token(Tok.CODE_BLOCK, text, listIndentation + 4));
      }

      this.indentation = listIndentation;
    } else if (this.chars[this.pos] === '>') {
      let count = 0;
      let val = ''
      while (this.chars[this.pos] === '>') {
        val += this.chars[this.pos++];
        if (this.pos < this.chars.length && /[ \t]/.test(this.chars[this.pos])) {
          val += this.chars[this.pos++];
        }
        count++;
      }

      // If lazy block quotes is enabled, dissallow decreasing the nesting level, unless for when the line is empty.
      const lazyBlockQuotes = true;
      if (lazyBlockQuotes) {
        if (count < this.blockQuote && val.trim() !== this.line.trim()) {
          count = this.blockQuote;
        }
      }

      for (let i = this.blockQuote; i > count; i--) {
        tokens.push(new Token(Tok.END_BLOCK_QUOTE, '', i));
      }

      for (let i = this.blockQuote+1; i <= count; i++) {
        tokens.push(new Token(Tok.BLOCK_QUOTE, i == count ? val : '', i));
      }
      this.blockQuote = count;
    }

    return tokens;
  }
}

class Parser {
  constructor(tokens) {
    this.tokens = new Buffer(tokens);
    this.styleChars = /[*_~^`+-]/;
    this.layoutChars = /[|]/;
  }

  parse() {
    return this.parseDocument();
  }

  parseDocument() {
    const blocks = [];
    while (this.tokens.hasNext()) {
      try {
        const block = this.parseBlock();
        blocks.push(block);
      } catch (error) {
        if (!(error instanceof ParseError)) {
          throw error;
        }
  
        console.error('Parse Error:', error);

        const text = this.tokens.expectAll(/[^\n]/) + this.tokens.expectAll('\n');
        blocks.push(new ErrorNode(text));
      }
    }

    return new DocumentNode(blocks);
  }

  parseBlock() {
    if (this.tokens.peek()?.tok === Tok.BLANK_LINE || this.tokens.peek()?.val === '\n') {
      this.tokens.next();
    }

    if (this.tokens.peek()?.val === '#') {
      return this.parseHeader();
    } else if (this.tokens.peek()?.val === '|') {
      return this.parseTable();
    } else if (this.tokens.peek()?.tok === Tok.BLOCK_QUOTE) {
      return this.parseBlockQuote();
    } else if (this.tokens.peek()?.tok === Tok.CODE_BLOCK) {
      return this.parseCodeBlock();
    } else if (this.tokens.peek()?.tok === Tok.LIST) {
      return this.parseList();
    } else {
      return this.parseParagraph();
    }
  }

  parseHeader() {
    const headerLevel = this.tokens.expectAll('#').length;

    const content = [];
    while (this.tokens.hasNext() && this.tokens.peek().val !== '\n') {
      const node = this.parseInline();
      content.push(node);
    }

    this.tokens.expectOrEOF('\n');

    return new HeaderNode(headerLevel, content);
  }

  parseTable() {
    const header = this.parseTableRow();
    this.parseTableSep();

    const rows = [];
    while (this.tokens.peek()?.val === '|') {
      const row = this.parseTableRow();
      rows.push(row);
    }

    return new TableNode(header, rows);
  }

  parseTableRow() {
    this.tokens.expect('|');

    const row = [];
    while (this.tokens.hasNext() && this.tokens.peek().val !== '\n') {
      const col = this.parseInline();
      this.tokens.expect('|');
      row.push(col);
    }

    this.tokens.expectOrEOF('\n');

    return row;
  }

  parseTableSep() {
    this.tokens.expect('|');

    const row = [];
    while (this.tokens.hasNext() && this.tokens.peek().val !== '\n') {
      const sep = this.tokens.expectAll(/[ \t]/) + this.tokens.expectAll('-') + this.tokens.expectAll(/[ \t]/);
      this.tokens.expect('|');
      row.push(sep);
    }

    this.tokens.expectOrEOF('\n');

    return row;
  }

  parseBlockQuote() {
    this.tokens.next();

    const blocks = []
    blocks.push(this.parseBlock());
    while (this.tokens.peek()?.tok !== Tok.END_BLOCK_QUOTE) {
      blocks.push(this.parseBlock());
    }

    this.tokens.next();

    return new BlockQuoteNode(blocks);
  }

  parseCodeBlock() {
    let text = '';
    while (this.tokens.peek()?.tok === Tok.CODE_BLOCK) {
      const codeBlock = this.tokens.next();
      text += codeBlock.val;
    }

    return new CodeBlockNode(text);
  }

  parseList() {
    this.tokens.next();

    const items = [];
    while (this.tokens.peek()?.tok !== Tok.END_LIST) {
      const item = this.parseListItem();
      items.push(item);
    }

    this.tokens.next();

    return new ListNode(items);
  }

  parseListItem() {
    this.tokens.next();

    const blocks = [];
    while (this.tokens.peek()?.tok !== Tok.END_LIST_ITEM) {
      const block = this.parseBlock();
      blocks.push(block);
    }

    this.tokens.next();

    return new ListItemNode(blocks);
  }

  parseParagraph() {
    const lines = [];
    while (this.tokens.hasNext() && this.tokens.peek().val !== '\n' && this.tokens.peek().tok === Tok.TEXT) {
      const line = this.parseInline();
      lines.push(line);
    }

    return new ParagraphNode(lines);
  }

  parseLine() {
    const content = [];
    while (this.tokens.hasNext() && this.tokens.peek().val !== '\n') {
      const node = this.parseInline();
      content.push(node);
    }

    this.tokens.expectOrEOF('\n');

    return new LineNode(content);
  }

  parseInline() {
    if (this.styleChars.test(this.tokens.peek().val)) {
      return this.parseStyle()
    } else {
      return this.parseText();
    }
  }

  parseStyle() {
    const styleTypes = {
      '*': 'em',
      '**': 'strong',
      '_': 'em',
      '__': 'u',
      '~~': 's',
      '~': 'sub',
      '^': 'sup',
      '--': 'small',
      '++': 'big',
      '`': 'code',
    };

    let start = this.tokens.expect(this.styleChars).val;
    if (start + this.tokens.peek()?.val in styleTypes) {
      start += this.tokens.expect(start).val;
    }

    if (!(start in styleTypes)) {
      return new TextNode(start);
    }

    const content = [];
    while (this.tokens.hasNext()) {
      if (this.tokens.peek().val === start[0]) {
        this.tokens.next();
        if (start.length === 1 || this.tokens.peek()?.val === start[1]) {
          if (start.length === 2) this.tokens.next();
          return new StyleNode(styleTypes[start], content);
        } else {
          content.push(new TextNode(start[0]));
        }
      }

      content.push(this.parseInline());
    }

    content.unshift(new TextNode(start));
    return new StyleNode('span', content);
  }

  parseText() {
    let text = '';
    while (
      this.tokens.hasNext()
      && this.tokens.peek().tok === Tok.TEXT
      && !this.styleChars.test(this.tokens.peek().val)
      && !this.layoutChars.test(this.tokens.peek().val)
  ) {
      text += this.tokens.next().val;
    }

    return new TextNode(text);
  }
}

class Node {}

class DocumentNode extends Node {
  constructor(blocks) {
    super();
    this.blocks = blocks;
  }

  html() {
    return this.blocks.map((block) => block.html()).join('\n');
  }
}

class BlockNode extends Node {}

class HeaderNode extends BlockNode {
  constructor(level, content) {
    super();
    this.level = level;
    this.content = content;
  }

  html() {
    return `<h${this.level}>` + this.content.map((node) => node.html()).join('') + `</h${this.level}>`;
  }
}

class TableNode extends BlockNode {
  constructor(header, rows) {
    super();
    this.header = header;
    this.rows = rows;
  }

  html() {
    return '<table>\n'
      + '<thead>'
      + this.header.map((col) => `<th>${col.html()}</th>`).join('')
      + '</thead>\n'
      + '<tbody>\n'
      + this.rows.map((row) => `\t<tr>${row.map((col) => `<td>${col.html()}</td>`).join('')}</tr>\n`).join('')
      + '</tbody>\n'
      + '</table>';
  }
}

class BlockQuoteNode extends BlockNode {
  constructor(blocks) {
    super();
    this.blocks = blocks;
  }

  html() {
    return '<blockquote>' + this.blocks.map((block) => block.html()).join('') + '</blockquote>';
  }
}

class CodeBlockNode extends BlockNode {
  constructor(text) {
    super();
    this.text = text;
  }

  html() {
    return `<pre><code>${this.text}</code></pre>`;
  }
}

class ListNode extends BlockNode {
  constructor(items) {
    super();
    this.items = items;
  }

  html() {
    return '<ul>\n' + this.items.map((items) => items.html()).join('\n') + '\n</ul>';
  }
}

class ListItemNode extends BlockNode {
  constructor(blocks) {
    super();
    this.blocks = blocks;
  }

  html() {
    return '<li>' + this.blocks.map((block) => block.html()).join('') + '</li>';
  }
}

class ParagraphNode extends BlockNode {
  constructor(lines) {
    super();
    this.lines = lines;
  }

  html() {
    return '<p>' + this.lines.map((node) => node.html()).join('<br>') + '</p>';
  }
}

class LineNode extends Node {
  constructor(content) {
    super();
    this.content = content;
  }

  html() {
    return this.content.map((node) => node.html()).join('');
  }
}

class InlineNode extends Node {}

class StyleNode extends InlineNode {
  constructor(type, content) {
    super();
    this.type = type;
    this.content = content;
  }

  html() {
    return `<${this.type}>` + this.content.map((node) => node.html()).join('') + `</${this.type}>`;
  }
}

class TextNode extends InlineNode {
  constructor(text) {
    super();
    this.text = text;
  }

  html() {
    return this.text;
  }
}

class ErrorNode extends Node {
  constructor(text) {
    super();
    this.text = text;
  }

  html() {
    return `<span style="color: red;">${this.text}</span>`;
  }
}

const editor = document.querySelector('#editor');
const output = document.querySelector('#output');
const raw = document.querySelector('#raw');
const html = document.querySelector('#html');
const toks = document.querySelector('#toks');
const none = document.querySelector('#none');

function update() {
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
