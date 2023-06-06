/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import CSharpExtensionExports from '../../src/CSharpExtensionExports';
import { Advisor } from '../../src/features/diagnosticsProvider';
import { EventStream } from '../../src/EventStream';
import { EventType } from '../../src/omnisharp/EventType';

export interface ActivationResult {
    readonly advisor: Advisor;
    readonly eventStream: EventStream;
}

export async function activateCSharpExtension(): Promise<ActivationResult> {
    const csharpExtension = vscode.extensions.getExtension<CSharpExtensionExports>("ms-dotnettools.csharp");
    if (!csharpExtension) {
        throw new Error("Failed to find installation of ms-dotnettools.csharp");
    }

    if (!csharpExtension.isActive) {
        await csharpExtension.activate();
    }

    try {
        await csharpExtension.exports.initializationFinished();
        const advisor = await csharpExtension.exports.getAdvisor();
        const eventStream = csharpExtension.exports.eventStream;
        console.log("ms-dotnettools.csharp activated");
        return {
            advisor: advisor,
            eventStream: eventStream
        };
    }
    catch (err) {
        console.log(JSON.stringify(err));
        throw err;
    }
}

export async function restartOmniSharpServer(): Promise<void> {
    const csharpExtension = vscode.extensions.getExtension<CSharpExtensionExports>("ms-dotnettools.csharp");
    if (!csharpExtension) {
        throw new Error("Failed to find installation of ms-dotnettools.csharp");
    }

    if (!csharpExtension.isActive) {
        await activateCSharpExtension();
    }

    try {
        await new Promise<void>(resolve => {
            const hook = csharpExtension.exports.eventStream.subscribe(event => {
                if (event.type == EventType.OmnisharpStart) {
                    hook.unsubscribe();
                    resolve();
                }
            });
            vscode.commands.executeCommand("o.restart");
        });
        console.log("OmniSharp restarted");
    }
    catch (err) {
        console.log(JSON.stringify(err));
        throw err;
    }
}

export function isRazorWorkspace(workspace: typeof vscode.workspace) {
    return isGivenSln(workspace, 'BasicRazorApp2_1');
}

export function isSlnWithCsproj(workspace: typeof vscode.workspace) {
    return isGivenSln(workspace, 'slnWithCsproj');
}

export function isSlnWithGenerator(workspace: typeof vscode.workspace) {
    return isGivenSln(workspace,  'slnWithGenerator');
}

function isGivenSln(workspace: typeof vscode.workspace, expectedProjectFileName: string) {
    const primeWorkspace = workspace.workspaceFolders![0];
    const projectFileName = primeWorkspace.uri.fsPath.split(path.sep).pop();

    return projectFileName === expectedProjectFileName;
}
