import type { ContextPredicate, ContextSnapshot, ContextValue } from "./context-types";

const cache = new Map<string, ContextPredicate>();

type TokenType = "word" | "string" | "and" | "or" | "not" | "eq" | "neq" | "lparen" | "rparen";

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

function syntaxError(source: string, position: number, message: string): SyntaxError {
  return new SyntaxError(`${message} at position ${position} in context expression: ${source}`);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (source.startsWith("&&", index)) {
      tokens.push({ type: "and", value: "&&", position: index });
      index += 2;
      continue;
    }
    if (source.startsWith("||", index)) {
      tokens.push({ type: "or", value: "||", position: index });
      index += 2;
      continue;
    }
    if (source.startsWith("==", index)) {
      tokens.push({ type: "eq", value: "==", position: index });
      index += 2;
      continue;
    }
    if (source.startsWith("!=", index)) {
      tokens.push({ type: "neq", value: "!=", position: index });
      index += 2;
      continue;
    }
    if (character === "!") {
      tokens.push({ type: "not", value: "!", position: index });
      index += 1;
      continue;
    }
    if (character === "(") {
      tokens.push({ type: "lparen", value: "(", position: index });
      index += 1;
      continue;
    }
    if (character === ")") {
      tokens.push({ type: "rparen", value: ")", position: index });
      index += 1;
      continue;
    }

    if (character === "'" || character === '"') {
      const quote = character;
      const start = index;
      index += 1;
      let value = "";
      let closed = false;

      while (index < source.length) {
        const current = source[index];
        if (current === quote) {
          closed = true;
          index += 1;
          break;
        }
        if (current === "\\") {
          index += 1;
          if (index >= source.length) throw syntaxError(source, start, "Unterminated escape sequence");
          const escaped = source[index];
          if (escaped === "n") value += "\n";
          else if (escaped === "r") value += "\r";
          else if (escaped === "t") value += "\t";
          else value += escaped;
          index += 1;
          continue;
        }
        value += current;
        index += 1;
      }

      if (!closed) throw syntaxError(source, start, "Unterminated quoted literal");
      tokens.push({ type: "string", value, position: start });
      continue;
    }

    if (character === "&" || character === "|" || character === "=") {
      throw syntaxError(source, index, `Unexpected token ${character}`);
    }

    const start = index;
    while (index < source.length && !/[\s&|!()=]/.test(source[index])) index += 1;
    if (index === start) throw syntaxError(source, index, `Unexpected token ${source[index]}`);
    tokens.push({ type: "word", value: source.slice(start, index), position: start });
  }

  return tokens;
}

function parseLiteral(token: Token): ContextValue {
  if (token.type === "string") return token.value;
  const value = token.value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value === "undefined") return undefined;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

class ContextExpressionParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
  ) {}

  parse(): ContextPredicate {
    if (this.tokens.length === 0) return () => true;
    const predicate = this.parseOr();
    const remaining = this.peek();
    if (remaining) throw syntaxError(this.source, remaining.position, `Unexpected token ${remaining.value}`);
    return predicate;
  }

  private parseOr(): ContextPredicate {
    let predicate = this.parseAnd();
    while (this.match("or")) {
      const left = predicate;
      const right = this.parseAnd();
      predicate = (context) => left(context) || right(context);
    }
    return predicate;
  }

  private parseAnd(): ContextPredicate {
    let predicate = this.parseUnary();
    while (this.match("and")) {
      const left = predicate;
      const right = this.parseUnary();
      predicate = (context) => left(context) && right(context);
    }
    return predicate;
  }

  private parseUnary(): ContextPredicate {
    if (this.match("not")) {
      const operand = this.parseUnary();
      return (context) => !operand(context);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ContextPredicate {
    if (this.match("lparen")) {
      const predicate = this.parseOr();
      const closing = this.consume("rparen", "Expected closing parenthesis");
      if (!closing) return () => false;
      return predicate;
    }
    return this.parseComparison();
  }

  private parseComparison(): ContextPredicate {
    const key = this.consume("word", "Expected a context key");
    if (!key) return () => false;

    const operator = this.peek();
    if (operator?.type !== "eq" && operator?.type !== "neq") {
      return (context: ContextSnapshot) => Boolean(context[key.value]);
    }

    this.index += 1;
    const expectedToken = this.peek();
    if (!expectedToken || (expectedToken.type !== "word" && expectedToken.type !== "string")) {
      const position = expectedToken?.position ?? this.source.length;
      throw syntaxError(this.source, position, "Expected a literal after comparison operator");
    }
    this.index += 1;
    const expected = parseLiteral(expectedToken);

    if (operator.type === "eq") return (context) => context[key.value] === expected;
    return (context) => context[key.value] !== expected;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private match(type: TokenType): boolean {
    if (this.peek()?.type !== type) return false;
    this.index += 1;
    return true;
  }

  private consume(type: TokenType, message: string): Token | undefined {
    const token = this.peek();
    if (token?.type === type) {
      this.index += 1;
      return token;
    }
    const position = token?.position ?? this.source.length;
    throw syntaxError(this.source, position, message);
  }
}

export function compileContextExpression(expression?: string): ContextPredicate {
  const source = expression?.trim();
  if (!source) return () => true;

  const existing = cache.get(source);
  if (existing) return existing;

  const parser = new ContextExpressionParser(source, tokenize(source));
  const predicate = parser.parse();
  cache.set(source, predicate);
  return predicate;
}
