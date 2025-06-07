import Buffer from "./buffer.js";
import { Tok } from "./lexer.js";
import * as ast from "./ast.js";

class ParseError extends Error {}

export default class Parser {
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
        blocks.push(new ast.ErrorNode(text));
      }
    }

    return new ast.DocumentNode(blocks);
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

    return new ast.HeaderNode(headerLevel, content);
  }

  parseTable() {
    const header = this.parseTableRow();
    this.parseTableSep();

    const rows = [];
    while (this.tokens.peek()?.val === '|') {
      const row = this.parseTableRow();
      rows.push(row);
    }

    return new ast.TableNode(header, rows);
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

    return new ast.BlockQuoteNode(blocks);
  }

  parseCodeBlock() {
    let text = '';
    while (this.tokens.peek()?.tok === Tok.CODE_BLOCK) {
      const codeBlock = this.tokens.next();
      text += codeBlock.val;
    }

    return new ast.CodeBlockNode(text);
  }

  parseList() {
    this.tokens.next();

    const items = [];
    while (this.tokens.peek()?.tok !== Tok.END_LIST) {
      const item = this.parseListItem();
      items.push(item);
    }

    this.tokens.next();

    return new ast.ListNode(items);
  }

  parseListItem() {
    this.tokens.next();

    const blocks = [];
    while (this.tokens.peek()?.tok !== Tok.END_LIST_ITEM) {
      const block = this.parseBlock();
      blocks.push(block);
    }

    this.tokens.next();

    return new ast.ListItemNode(blocks);
  }

  parseParagraph() {
    const lines = [];
    while (this.tokens.hasNext() && this.tokens.peek().val !== '\n' && this.tokens.peek().tok === Tok.TEXT) {
      const line = this.parseInline();
      lines.push(line);
    }

    return new ast.ParagraphNode(lines);
  }

  parseLine() {
    const content = [];
    while (this.tokens.hasNext() && this.tokens.peek().val !== '\n') {
      const node = this.parseInline();
      content.push(node);
    }

    this.tokens.expectOrEOF('\n');

    return new ast.LineNode(content);
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
      return new ast.TextNode(start);
    }

    const content = [];
    while (this.tokens.hasNext() && this.tokens.peek().tok === Tok.TEXT) {
      if (this.tokens.peek().val === start[0]) {
        this.tokens.next();
        if (start.length === 1 || this.tokens.peek()?.val === start[1]) {
          if (start.length === 2) this.tokens.next();
          return new ast.StyleNode(styleTypes[start], content);
        } else {
          content.push(new ast.TextNode(start[0]));
        }
      }

      content.push(this.parseInline());
    }

    content.unshift(new ast.TextNode(start));
    return new ast.StyleNode('span', content);
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

    return new ast.TextNode(text);
  }
}
