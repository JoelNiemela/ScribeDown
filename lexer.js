export const Tok = Object.freeze({
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

export class Token {
  constructor(tok, val, data) {
    this.tok = tok;
    this.val = val;
    this.data = data;
  }
}

export class Lexer {
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
