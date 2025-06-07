export default class Buffer {
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
