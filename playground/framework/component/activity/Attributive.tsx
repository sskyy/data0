import {createElement} from "@framework";
import { createToken, Lexer, TokenType, CstParser } from "chevrotain";


enum TokenName {
    And = "And",
    Or = "Or",
    Not = "Not",
    LParen = "LParen",
    RParen = "RParen",
    WhiteSpace = "WhiteSpace",
    AttrLiteral = "AttrLiteral",
}

const And = createToken({
    name: TokenName.And,
    pattern: /&&/,
});

const Or = createToken({
    name: TokenName.Or,
    pattern: /\|\|/,
});

const Not = createToken({
    name: TokenName.Not,
    pattern: /!/,
});

const LParen = createToken({
    name: TokenName.LParen,
    pattern: /\(/,
});
const RParen = createToken({
    name: TokenName.RParen,
    pattern: /\)/,
});
const WhiteSpace = createToken({
    name: TokenName.WhiteSpace,
    pattern: /\s+/,
    group: Lexer.SKIPPED,
});

const AttrLiteral = createToken({
    name: TokenName.AttrLiteral,
    pattern: /[\w\d_]+/
})

const tokensByPriority = [
    WhiteSpace,
    Or,
    And,
    Not,
    LParen,
    RParen,
    AttrLiteral
];

export const FormulaLexer = new Lexer(tokensByPriority, {
    ensureOptimizations: true,
});
export type TokenTypeDict = { [key in TokenName]: TokenType };
export const tokens: TokenTypeDict = tokensByPriority.reduce(
    (acc, tokenType) => {
        acc[tokenType.name] = tokenType;
        return acc;
    },
    {} as TokenTypeDict
);



export class FormulaParser extends CstParser {
    constructor() {
        super(tokens, {
            maxLookahead: 1,
        });
        this.performSelfAnalysis();
    }
    expression = this.RULE("expression", () => {

        this.SUBRULE(this.orExpression)
    });
    orExpression = this.RULE("orExpression", () => {
        this.SUBRULE(this.andExpression, { LABEL: "lhs" });
        this.MANY(() => {
            this.CONSUME(tokens.Or);
            this.SUBRULE1(this.andExpression, { LABEL: "rhs" });
        });
    });
    andExpression = this.RULE("andExpression", () => {
        this.SUBRULE(this.atomicExpression, { LABEL: "lhs" });
        this.MANY(() => {
            this.CONSUME(tokens.And);
            this.SUBRULE1(this.atomicExpression, { LABEL: "rhs" });
        });
    });
    atomicExpression = this.RULE("atomicExpression", () => {
        this.OR([
            { ALT: () => this.SUBRULE(this.parenthesisExpression) },
            { ALT: () => this.SUBRULE(this.notExpression) },
            { ALT: () => this.CONSUME(tokens.AttrLiteral) },
        ]);
    });
    parenthesisExpression = this.RULE("parenthesisExpression", () => {
        this.CONSUME(tokens.LParen);
        this.SUBRULE(this.expression);
        this.CONSUME(tokens.RParen);
    });
    notExpression = this.RULE("notExpression", () => {
        this.CONSUME(tokens.Not);
        this.OR([
            { ALT: () => this.SUBRULE(this.parenthesisExpression) },
            { ALT: () => this.CONSUME(tokens.AttrLiteral) },
        ]);
    });
}

const parser = new FormulaParser();


function parseInput(text) {
    const lexingResult = FormulaLexer.tokenize(text);
    // "input" is a setter which will reset the parser's state.
    parser.input = lexingResult.tokens;
    const cst = parser.expression();

    debugger

    if (parser.errors.length > 0) {
        throw new Error("sad sad panda, Parsing errors detected");
    }
}

parseInput('ASDF && !test || test && (t1 || t2)')
// parseInput('ASDF')


export function Attributive({ options }) {
    return <div contenteditable={true}></div>
}
