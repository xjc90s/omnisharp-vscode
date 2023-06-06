/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as serverUtils from '../omnisharp/utils';
import * as protocol from '../omnisharp/protocol';
import { OmniSharpServer } from '../omnisharp/server';
import { FixAllScope, FixAllItem } from '../omnisharp/protocol';
import CompositeDisposable from '../CompositeDisposable';
import AbstractProvider from './abstractProvider';
import { LanguageMiddlewareFeature } from '../omnisharp/LanguageMiddlewareFeature';
import { buildEditForResponse } from '../omnisharp/fileOperationsResponseEditBuilder';
import { CancellationToken } from 'vscode-languageserver-protocol';

export class FixAllProvider extends AbstractProvider implements vscode.CodeActionProvider {
    public static fixAllCodeActionKind =
      vscode.CodeActionKind.SourceFixAll.append('csharp');

    public static metadata: vscode.CodeActionProviderMetadata = {
      providedCodeActionKinds: [FixAllProvider.fixAllCodeActionKind]
    };

    public constructor(private server: OmniSharpServer, languageMiddlewareFeature: LanguageMiddlewareFeature) {
        super(server, languageMiddlewareFeature);
        let disposable = new CompositeDisposable();
        disposable.add(vscode.commands.registerCommand('o.fixAll.solution', async () => this.fixAllMenu(server, protocol.FixAllScope.Solution)));
        disposable.add(vscode.commands.registerCommand('o.fixAll.project', async () => this.fixAllMenu(server, protocol.FixAllScope.Project)));
        disposable.add(vscode.commands.registerCommand('o.fixAll.document', async () => this.fixAllMenu(server, protocol.FixAllScope.Document)));
        this.addDisposables(disposable);
    }

    public async provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken,
    ): Promise<vscode.CodeAction[]> {
        console.log(context);
        if (!context.only) {
            return [];
        }

        if (context.only.contains(FixAllProvider.fixAllCodeActionKind)) {
            await this.applyFixes(document.fileName, FixAllScope.Document, undefined);
        }

        return [];
    }

    private async fixAllMenu(server: OmniSharpServer, scope: protocol.FixAllScope): Promise<void> {
        const fileName = vscode.window.activeTextEditor?.document.fileName;
        if (fileName === undefined) {
            vscode.window.showWarningMessage('Text editor must be focused to fix all issues');
            return;
        }

        let availableFixes = await serverUtils.getFixAll(server, { FileName: fileName, Scope: scope });

        let targets = availableFixes.Items.map(x => `${x.Id}: ${x.Message}`);

        if (scope === protocol.FixAllScope.Document) {
            targets = ["Fix all issues", ...targets];
        }

        const action = await vscode.window.showQuickPick(targets, {
            matchOnDescription: true,
            placeHolder: `Select fix all action`
        });

        if (action === undefined) {
            return;
        }

        let filter: FixAllItem[] | undefined;
        if (action !== "Fix all issues") {
            let actionTokens = action.split(":");
            filter = [{ Id: actionTokens[0], Message: actionTokens[1] }];
        }

        await this.applyFixes(fileName, scope, filter);
    }

    private async applyFixes(fileName: string, scope: FixAllScope, fixAllFilter: FixAllItem[] | undefined): Promise<void> {
        let response = await serverUtils.runFixAll(this.server, {
            FileName: fileName,
            Scope: scope,
            FixAllFilter: fixAllFilter,
            WantsAllCodeActionOperations: true,
            WantsTextChanges: true,
            ApplyChanges: false
        });

        if (response) {
            await buildEditForResponse(response.Changes, this._languageMiddlewareFeature, CancellationToken.None);
        }
    }
}
