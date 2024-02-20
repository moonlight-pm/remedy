import { ServerFeature } from ".";

export default function (): ServerFeature {
    return {
        async fetch(request) {
            const url = new URL(request.url);

            if (url.pathname === "/_htmx") {
                const file = Bun.file(
                    `${import.meta.dir}/../../../../node_modules/htmx.org/dist/htmx.js`,
                );
                return new Response(file, {
                    headers: {
                        "Content-Type": file.type,
                    },
                });
            }
        },
        element(element) {
            if (element.tagName === "head") {
                element.append(`<script src="/_htmx" defer></script>\n`, {
                    html: true,
                });
            }
        },
    };
}
