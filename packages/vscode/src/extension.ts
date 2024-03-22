import * as serverProtocol from "@volar/language-server/protocol";
import { createLabsInfo, getTsdk } from "@volar/vscode";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as vscode from "vscode";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
    await initializeExtension(context);
    const serverPath = `${context.extensionPath}/dist/server/index.js`;
    client = new LanguageClient(
        "partial",
        "remedy language server",
        {
            run: {
                module: serverPath,
                transport: TransportKind.ipc,
                options: { execArgv: [] },
            },
            debug: {
                module: serverPath,
                transport: TransportKind.ipc,
                options: { execArgv: ["--nolazy", "--inspect=6009"] },
            },
        },
        {
            documentSelector: [{ language: "partial" }],
            initializationOptions: {
                typescript: {
                    tsdk: (await getTsdk(context)).tsdk,
                },
            },
        },
    );
    await client.start();

    const labs = createLabsInfo(serverProtocol);
    labs.addLanguageClient(client);

    return labs.extensionExports;
}

export function deactivate() {
    return client?.stop();
}

async function initializeExtension(context) {
    const config = getWorkspaceConfig();
    if (config.features?.tailwind) {
        vscode.workspace.getConfiguration("tailwindCSS").update("includeLanguages", {
            partial: "html",
        });
    }
}

function getWorkspaceConfig() {
    const workspacePath = vscode.workspace.workspaceFolders[0]?.uri.fsPath;
    if (!workspacePath) {
        return {};
    }
    const configPath = `${workspacePath}/remedy.config.ts`;
    if (!fs.existsSync(configPath)) {
        return {};
    }
    const dir = makeTemporaryDirectory();
    const tmp = `${dir}/remedy.config.ts`;
    fs.writeFileSync(
        tmp,
        `
        import config from "${configPath}";
        console.log(JSON.stringify(config));
    `,
    );
    const output = spawnSync("bun", [tmp]);
    fs.rmSync(dir, { recursive: true });
    if (output.status !== 0) {
        return {};
    }
    try {
        return JSON.parse(output.stdout.toString("utf-8"));
    } catch {
        return {};
    }
}

export function makeTemporaryDirectory() {
    return fs.mkdtempSync(`${os.tmpdir()}/remedy-`);
}
