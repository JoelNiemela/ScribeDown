export class Node {}

export class DocumentNode extends Node {
  constructor(blocks) {
    super();
    this.blocks = blocks;
  }

  html() {
    return this.blocks.map((block) => block.html()).join('\n');
  }
}

export class BlockNode extends Node {}

export class HeaderNode extends BlockNode {
  constructor(level, content) {
    super();
    this.level = level;
    this.content = content;
  }

  html() {
    return `<h${this.level}>` + this.content.map((node) => node.html()).join('') + `</h${this.level}>`;
  }
}

export class TableNode extends BlockNode {
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

export class BlockQuoteNode extends BlockNode {
  constructor(blocks) {
    super();
    this.blocks = blocks;
  }

  html() {
    return '<blockquote>' + this.blocks.map((block) => block.html()).join('') + '</blockquote>';
  }
}

export class CodeBlockNode extends BlockNode {
  constructor(text) {
    super();
    this.text = text;
  }

  html() {
    return `<pre><code>${this.text}</code></pre>`;
  }
}

export class ListNode extends BlockNode {
  constructor(items) {
    super();
    this.items = items;
  }

  html() {
    return '<ul>\n' + this.items.map((items) => items.html()).join('\n') + '\n</ul>';
  }
}

export class ListItemNode extends BlockNode {
  constructor(blocks) {
    super();
    this.blocks = blocks;
  }

  html() {
    return '<li>' + this.blocks.map((block) => block.html()).join('') + '</li>';
  }
}

export class ParagraphNode extends BlockNode {
  constructor(lines) {
    super();
    this.lines = lines;
  }

  html() {
    return '<p>' + this.lines.map((node) => node.html()).join('<br>') + '</p>';
  }
}

export class LineNode extends Node {
  constructor(content) {
    super();
    this.content = content;
  }

  html() {
    return this.content.map((node) => node.html()).join('');
  }
}

export class InlineNode extends Node {}

export class StyleNode extends InlineNode {
  constructor(type, content) {
    super();
    this.type = type;
    this.content = content;
  }

  html() {
    return `<${this.type}>` + this.content.map((node) => node.html()).join('') + `</${this.type}>`;
  }
}

export class TextNode extends InlineNode {
  constructor(text) {
    super();
    this.text = text;
  }

  html() {
    return this.text;
  }
}

export class ErrorNode extends Node {
  constructor(text) {
    super();
    this.text = text;
  }

  html() {
    return `<span style="color: red;">${this.text}</span>`;
  }
}
