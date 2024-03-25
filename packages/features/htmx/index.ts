import { RemedyFeatureFactory, createHtmlElement } from "@niarada/remedy";

export default function (): RemedyFeatureFactory {
    return (config) => ({
        async intercede(context) {
            if (context.url.pathname === "/_htmx") {
                const file = Bun.file(require.resolve("htmx.org"));
                return new Response(file, {
                    headers: {
                        "Content-Type": file.type,
                    },
                });
            }
            return undefined;
        },
        transform(node) {
            if (node.type === "element" && node.tag === "head") {
                node.children.push(
                    createHtmlElement(node, "script", {
                        type: "module",
                        src: "/_htmx",
                    }),
                );
            }
            return node;
        },
    });
}
