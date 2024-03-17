import { CstChildrenDictionary, CstNode, IToken } from "chevrotain";
import { error } from "~/lib/log";
import { parse } from "./parser";
import { htmlVoidTags } from "./tags";
import {
    BaseTemplateVisitorWithDefaults,
    getNode,
    getNodes,
    getToken,
    getTokenImage,
    getTokens,
    orderedFlatChildren,
    orderedFlatNodeChildren,
    visit,
    visitEach,
} from "./visitor";

export type Scope = Record<string, unknown>;

export type HtmlFragment = {
    type: "fragment";
    parent?: HtmlParent;
    children: HtmlNode[];
    scope: Scope;
};

export type HtmlComment = {
    type: "comment";
    parent: HtmlParent;
    content: string;
    scope: Scope;
};

export type HtmlText = {
    type: "text";
    parent: HtmlParent;
    content: string;
    scope: Scope;
};

export type HtmlExpression = {
    type: "expression";
    parent: HtmlParent;
    content: string;
    scope: Scope;
};

export type HtmlElement = {
    type: "element";
    parent: HtmlParent;
    children: HtmlNode[];
    tag: string;
    void: boolean;
    attrs: HtmlElementAttribute[];
    spaces: string[];
    scope: Scope;
};

export type HtmlElementAttribute = {
    name: string;
    value: HtmlElementAttributeValue[];
};

export type HtmlElementAttributeText = {
    type: "text";
    content: string;
};

export type HtmlElementAttributeExpression = {
    type: "expression";
    content: string;
};

export type HtmlNode = HtmlFragment | HtmlElement | HtmlText | HtmlExpression | HtmlComment;
export type HtmlParent = HtmlFragment | HtmlElement;
export type HtmlElementAttributeValue = HtmlElementAttributeText | HtmlElementAttributeExpression;

export const createHtmlFragment = (parent?: HtmlParent, ...children: HtmlNode[]): HtmlFragment => ({
    type: "fragment",
    parent,
    children,
    scope: Object.create(parent?.scope || null),
});

export const createHtmlComment = (parent: HtmlParent, content: string): HtmlComment => ({
    type: "comment",
    parent,
    content,
    scope: {},
});

export const createHtmlElement = (
    parent: HtmlParent,
    tag: string,
    attrs: HtmlElementAttribute[] | Record<string, unknown> = [],
    ...children: (HtmlElement | HtmlText)[]
): HtmlElement => ({
    type: "element",
    parent,
    tag,
    void: htmlVoidTags.includes(tag),
    attrs: Array.isArray(attrs)
        ? attrs
        : Object.entries(attrs).map(([name, value]) => ({
              name,
              value: [{ type: "text", content: String(value) }],
          })),
    children,
    spaces: [],
    scope: Object.create(parent.scope),
});

export const createHtmlText = (parent: HtmlParent, content: string): HtmlText => ({
    type: "text",
    parent,
    content,
    scope: Object.create(parent.scope),
});

export const createHtmlExpression = (parent: HtmlParent, content: string): HtmlExpression => ({
    type: "expression",
    parent,
    content,
    scope: Object.create(parent.scope),
});

class AstBuilder extends BaseTemplateVisitorWithDefaults {
    #stack: HtmlNode[] = [];
    #scope: Scope = {};

    constructor(scope?: Scope) {
        super();
        this.validateVisitor();
        this.#scope = scope || this.#scope;
    }

    get ast() {
        return this.#stack[0] as HtmlFragment;
    }

    get top(): HtmlParent {
        return this.#stack[this.#stack.length - 1] as HtmlParent;
    }

    append(node: HtmlNode) {
        this.top.children.push(node);
        return node;
    }

    document(context: CstChildrenDictionary) {
        this.#stack.push(createHtmlFragment());
        visit(this, context.fragment);
    }

    fragment(context: CstChildrenDictionary) {
        visitEach(this, orderedFlatNodeChildren(context));
    }

    comment(context: CstChildrenDictionary) {
        this.append(createHtmlComment(this.top, getTokenImage(context, "Comment")!));
    }

    element(context: CstChildrenDictionary) {
        const tagStart = context.tagStart[0];
        const tagStartIdentifier = getTokenImage(tagStart, "Identifier");
        const tagEnd = context.tagEnd?.[0];
        const tagEndIdentifier = tagEnd && getTokenImage(tagEnd, "Identifier");
        if (getToken(tagStart, "Slash") && tagEnd) {
            error(`Unexpected closing tag: ${tagEndIdentifier}`);
        }
        const element = this.append(createHtmlElement(this.top, tagStartIdentifier)) as HtmlElement;
        this.#stack.push(element);
        for (const attribute of getNodes(tagStart, "attribute")) {
            this.visit(attribute as CstNode);
        }
        const whitespace = getToken(tagStart, "WhiteSpace");
        if (whitespace) {
            element.spaces.push(whitespace.image);
        }
        if (!getToken(tagStart, "Slash") && !htmlVoidTags.includes(tagStartIdentifier) && context.fragment) {
            this.visit(context.fragment as CstNode[]);
        }
        this.#stack.pop();
    }

    attribute(context: CstChildrenDictionary) {
        const element = this.top as HtmlElement;
        element.spaces.push(getTokenImage(context, "WhiteSpace"));
        element.attrs.push({ name: getTokenImage(context, "Identifier"), value: [] });
        visit(this, context.attributeValue);
    }

    attributeValue(context: CstChildrenDictionary) {
        const element = this.top as HtmlElement;
        const attr = element.attrs[element.attrs.length - 1];
        const open =
            getToken(context, "OpenSingleQuote") ||
            getToken(context, "OpenDoubleQuote") ||
            getToken(context, "OpenBacktickQuote");
        if (!open) {
            const expression = getNode(context, "expression");
            const content = [];
            for (const part of getTokens(expression, "ExpressionPart")) {
                content.push(part.image);
            }
            attr.value.push({ type: "expression", content: content.join("") });
            return;
        }
        const children = orderedFlatChildren(context);
        children.shift();
        children.pop();
        for (const child of children) {
            if ((child as IToken).image) {
                attr.value.push({ type: "text", content: (child as IToken).image });
            } else {
                const content = [];
                for (const part of getTokens(child, "ExpressionPart")) {
                    content.push(part.image);
                }
                attr.value.push({ type: "expression", content: content.join("") });
            }
        }
    }

    // expression(context: CstChildrenDictionary) {
    //     for (const part of getTokens(context, "ExpressionPart")) {
    //         this.#output.push(part.image);
    //     }
    // }

    text(context: Record<string, IToken[]>) {
        // Need to handle embedded expressions
        this.append(createHtmlText(this.top, context.Text[0].image));
    }
}

export function parseSource(source: string, scope: Scope = {}) {
    const { document, errors } = parse(source);
    const visitor = new AstBuilder(scope);
    visitor.visit(document);
    return visitor.ast;
}
