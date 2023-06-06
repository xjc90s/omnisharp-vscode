/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as protocol from '../../src/omnisharp/protocol';
import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
// import { FormattingOptions } from 'jsonc-parser';

import { AssetGenerator, ProgramLaunchType, replaceCommentPropertiesWithComments, updateJsonWithComments } from '../../src/assets';
import { parse } from 'jsonc-parser';
import { use as chaiUse, should } from 'chai';
import { isNotNull } from '../testUtil';

chaiUse(require('chai-string'));

suite("Asset generation: csproj", () => {
    suiteSetup(() => should());

    test("Create tasks.json for project opened in workspace", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0');
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let tasksJson = generator.createTasksConfiguration();
        isNotNull(tasksJson.tasks);
        isNotNull(tasksJson.tasks[0].args);
        let buildPath = tasksJson.tasks[0].args[1];

        // ${workspaceFolder}/project.json
        let segments = buildPath.split(path.posix.sep);
        segments.should.deep.equal(['${workspaceFolder}', 'testApp.csproj']);
    });

    test("Generated 'build' and 'publish' tasks have the property GenerateFullPaths set to true ", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0');
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let tasksJson = generator.createTasksConfiguration();
        isNotNull(tasksJson.tasks);

        // We do not check the watch task since this parameter can break hot reload scenarios.
        tasksJson.tasks
            .filter(task => task.label !== "watch")
            .forEach(task => task.args!.should.contain("/property:GenerateFullPaths=true"));
    });

    test("Generated 'build' and 'publish' tasks have the consoleloggerparameters argument set to NoSummary", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0');
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let tasksJson = generator.createTasksConfiguration();
        isNotNull(tasksJson.tasks);

        // We do not check the watch task since this parameter can break hot reload scenarios.
        tasksJson.tasks
            .filter(task => task.label !== "watch")
            .forEach(task => task.args!.should.contain("/consoleloggerparameters:NoSummary"));
    });

    test("Generated 'watch' task does not have the property GenerateFullPaths set to true ", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0');
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let tasksJson = generator.createTasksConfiguration();
        isNotNull(tasksJson.tasks);

        const watchTask = tasksJson.tasks.find(task => task.label === "watch");
        isNotNull(watchTask?.args);
        watchTask.args.should.not.contain("/property:GenerateFullPaths=true");
    });

    test("Generated 'watch' task does not have the consoleloggerparameters argument set to NoSummary", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0');
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let tasksJson = generator.createTasksConfiguration();

        const watchTask = tasksJson.tasks!.find(task => task.label === "watch");
        isNotNull(watchTask?.args);
        watchTask.args.should.not.contain("/consoleloggerparameters:NoSummary");
    });

    test("Create tasks.json for nested project opened in workspace", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'nested', 'testApp.csproj'), 'testApp', 'netcoreapp1.0');
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let tasksJson = generator.createTasksConfiguration();
        isNotNull(tasksJson.tasks);
        isNotNull(tasksJson.tasks[0].args);
        let buildPath = tasksJson.tasks[0].args[1];

        // ${workspaceFolder}/nested/project.json
        let segments = buildPath.split(path.posix.sep);
        segments.should.deep.equal(['${workspaceFolder}', 'nested', 'testApp.csproj']);
    });

    test("Create launch.json for project opened in workspace", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0');
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.Console), undefined, { disallowComments: true });
        let programPath: string = launchJson[0].program;

        checkProgramPath(rootPath, programPath, info.MsBuild!.Projects[0].TargetPath);
    });

    [5, 6, 7, 8, 9].forEach(version => {
        const shortName = `net${version}.0`;

        test(`Create launch.json for NET ${version} project opened in workspace with shortname '${shortName}'`, () => {
            let rootPath = path.resolve('testRoot');
            let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', shortName, /*targetPath*/ undefined, /*isExe*/ true);
            let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
            generator.setStartupProject(0);
            let launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.Console), undefined, { disallowComments: true });
            let programPath: string = launchJson[0].program;

            checkProgramPath(rootPath, programPath, info.MsBuild!.Projects[0].TargetPath);
        });
    });

    test("Create launch.json for nested project opened in workspace", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'nested', 'testApp.csproj'), 'testApp', 'netcoreapp1.0');
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.Console), undefined, { disallowComments: true });
        let programPath: string = launchJson[0].program;

        checkProgramPath(rootPath, programPath, info.MsBuild!.Projects[0].TargetPath);
    });

    test("Create launch.json for project opened in workspace with non-relative output path", function() {
        if (process.platform !== "win32") {
            this.skip();
        }

        let rootPath = path.resolve('testRoot');
        let differentDrive = rootPath.startsWith('C:') ? 'D:' : 'C:';
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0', `${differentDrive}\\output.dll`);
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.Console), undefined, { disallowComments: true });
        let programPath: string = launchJson[0].program;

        checkProgramPath(rootPath, programPath, info.MsBuild!.Projects[0].TargetPath);
    });

    test("Create launch.json for Blazor web assembly standalone project opened in workspace", () => {
        const rootPath = path.resolve('testRoot');
        const info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netstandard2.1', /*targetPath*/ undefined, /*isExe*/ true, /*isWebProject*/ true, /*isBlazorWebAssemblyStandalone*/ true);
        const generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        const launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.BlazorWebAssemblyStandalone), undefined, { disallowComments: true });
        const blazorLaunchConfig = launchJson[0];
        const type = blazorLaunchConfig.type;

        type.should.equal('blazorwasm');
    });

    test("Create launch.json for nested Blazor web assembly standalone project opened in workspace", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'nested', 'testApp.csproj'), 'testApp', 'netstandard2.1', /*targetPath*/ undefined, /*isExe*/ true, /*isWebProject*/ true, /*isBlazorWebAssemblyStandalone*/ true);
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.BlazorWebAssemblyStandalone), undefined, { disallowComments: true });
        const blazorLaunchConfig = launchJson[0];
        const cwd = blazorLaunchConfig.cwd;

        cwd.should.equal('${workspaceFolder}/nested');
    });

    test("Create launch.json for Blazor web assembly hosted project opened in workspace", () => {
        const rootPath = path.resolve('testRoot');
        const info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp3.0', /*targetPath*/ undefined, /*isExe*/ true, /*isWebProject*/ true, /*isBlazorWebAssemblyStandalone*/ false, /*isBlazorWebAssemblyHosted*/ true);
        const generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        const launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.BlazorWebAssemblyHosted), undefined, { disallowComments: true });
        const hostedBlazorLaunchConfig = launchJson[0];
        const programPath: string = hostedBlazorLaunchConfig.program;
        const cwd = hostedBlazorLaunchConfig.cwd;
        const hosted = hostedBlazorLaunchConfig.hosted;

        checkProgramPath(rootPath, programPath, info.MsBuild!.Projects[0].TargetPath);

        cwd.should.equal('${workspaceFolder}');
        hosted.should.equal(true);
    });

    test("Create launch.json for nested Blazor web assembly hosted project opened in workspace", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'nested', 'testApp.csproj'), 'testApp', 'netcoreapp3.0', /*targetPath*/ undefined, /*isExe*/ true, /*isWebProject*/ true, /*isBlazorWebAssemblyStandalone*/ false, /*isBlazorWebAssemblyHosted*/ true);
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.BlazorWebAssemblyHosted), undefined, { disallowComments: true });
        const hostedBlazorLaunchConfig = launchJson[0];
        const programPath: string = hostedBlazorLaunchConfig.program;
        const cwd = hostedBlazorLaunchConfig.cwd;
        const hosted = hostedBlazorLaunchConfig.hosted;

        checkProgramPath(rootPath, programPath, info.MsBuild!.Projects[0].TargetPath);

        cwd.should.equal('${workspaceFolder}/nested');
        hosted.should.equal(true);
    });

    test("Create launch.json for web project opened in workspace", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0', /*targetPath*/ undefined, /*isExe*/ true, /*isWebProject*/ true);
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.Web), undefined, { disallowComments: true });
        let programPath: string = launchJson[0].program;

        checkProgramPath(rootPath, programPath, info.MsBuild!.Projects[0].TargetPath);
    });

    test("Create launch.json for nested web project opened in workspace", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'nested', 'testApp.csproj'), 'testApp', 'netcoreapp1.0', /*targetPath*/ undefined, /*isExe*/ true, /*isWebProject*/ true);
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let launchJson = parse(generator.createLaunchJsonConfigurations(ProgramLaunchType.Web), undefined, { disallowComments: true });
        let programPath: string = launchJson[0].program;

        checkProgramPath(rootPath, programPath, info.MsBuild!.Projects[0].TargetPath);
    });

    test("Add a new item to JSON", () => {
        const existingItem = { name: 'existing-item' };
        const original = {
            configurations: [
                existingItem
            ]
        };

        const newItem = { name: 'new-item' };
        const updated = updateJsonWithComments(JSON.stringify(original), [newItem], 'configurations', 'name', /*formattingOptions*/ null!);
        const parsed = jsonc.parse(updated);
        const configurations = parsed.configurations;

        const expected = [existingItem, newItem];
        configurations.should.deep.equal(expected);
    });

    test("Update item in JSON", () => {
        const existingItem = { name: 'existing-item', command: 'cmd' };
        const original = {
            configurations: [
                // this should update to have command dotnet, because the name is the same as our updated item
                { name: 'build', command: 'old value' },
                existingItem
            ]
        };

        const updatedItem = { name: 'build', command: 'dotnet' };

        const updated = updateJsonWithComments(JSON.stringify(original), [updatedItem], 'configurations', 'name', /*formattingOptions*/ null!);
        const parsed = jsonc.parse(updated);
        const configurations = parsed.configurations;

        const expected = [updatedItem, existingItem];
        configurations.should.deep.equal(expected);
    });

    test("Update JSON and preserve all comments", () => {
        const original = `
        // user comment in file
        {
            "configurations": [
                { "name": "build", "command": "old value" },
                {
                    // user comment in their configuration
                    "name": "existing-item",
                    "command": "cmd"
                }
            ]
        }`;

        const updatedItem = { name: 'build', command: 'dotnet' };

        const updated = updateJsonWithComments(original, [updatedItem], 'configurations', 'name', /*formattingOptions*/ null!);
        const lines = updated.trim().split('\n');

        lines[0].trim().should.equal('// user comment in file');
        lines[5].trim().should.equal('// user comment in their configuration');
    });

    test("Replace items named OS-COMMENTxxx with JSON comment syntax", () => {
        const original = `
        {
            "configurations": [
                {
                    "name": "build",
                    "OS-COMMENT": "This is a dotnet build command",
                    "OS-COMMENT2": "this is the default command.",
                    "command": "dotnet build"
                },
            ]
        }`;

        let updated = replaceCommentPropertiesWithComments(original);
        let lines = updated.trim().split('\n');

        lines[4].trim().should.equal('// This is a dotnet build command');
        lines[5].trim().should.equal('// this is the default command.');
    });

    test("createLaunchJsonConfigurationsArray removes comments", () => {
        let rootPath = path.resolve('testRoot');
        let info = createMSBuildWorkspaceInformation(path.join(rootPath, 'testApp.csproj'), 'testApp', 'netcoreapp1.0', /*targetPath*/ undefined, /*isExe*/ true, /*isWebProject*/ true);
        let generator = new AssetGenerator(info, createMockWorkspaceFolder(rootPath));
        generator.setStartupProject(0);
        let launchConfigurations: vscode.DebugConfiguration[] = generator.createLaunchJsonConfigurationsArray(ProgramLaunchType.Web);

        launchConfigurations.should.have.lengthOf(2);

        launchConfigurations[0].type.should.equal("coreclr");
        launchConfigurations[0].request.should.equal("launch");

        launchConfigurations[1].type.should.equal("coreclr");
        launchConfigurations[1].request.should.equal("attach");

        JSON.stringify(launchConfigurations).indexOf("OS-COMMENT").should.lessThan(0);
    });
});

function checkProgramPath(rootPath: string, programPath: string, targetPath: string): void {
    if (path.relative(rootPath, targetPath) !== targetPath) {
        programPath.should.startWith('${workspaceFolder}/');
        programPath.should.equal(targetPath.replace(rootPath, '${workspaceFolder}').replaceAll(path.win32.sep, path.posix.sep));
    } else {
        programPath.should.equal(targetPath.replaceAll(path.win32.sep, path.posix.sep));
    }
}

function createMockWorkspaceFolder(rootPath: string): vscode.WorkspaceFolder {
    return {
        uri: vscode.Uri.file(rootPath),
        name: '',
        index: -1
    };
}

function createMSBuildWorkspaceInformation(projectPath: string, assemblyName: string, targetFrameworkShortName: string, targetPath: string | undefined = undefined, isExe: boolean = true, isWebProject: boolean = false, isBlazorWebAssemblyStandalone: boolean = false, isBlazorWebAssemblyHosted: boolean = false): protocol.WorkspaceInformationResponse {
    return {
        MsBuild: {
            SolutionPath: '',
            Projects: [
                {
                    ProjectGuid: '',
                    Path: projectPath,
                    AssemblyName: assemblyName,
                    TargetPath: targetPath ?? path.join(path.dirname(projectPath), 'bin', 'Debug', new Date().getTime().toString(), targetFrameworkShortName, `${assemblyName}.dll`),
                    TargetFramework: '',
                    SourceFiles: [],
                    TargetFrameworks: [
                        {
                            Name: '',
                            FriendlyName: '',
                            ShortName: targetFrameworkShortName
                        }
                    ],
                    OutputPath: '',
                    IsExe: isExe,
                    IsUnityProject: false,
                    IsWebProject: isWebProject,
                    IsBlazorWebAssemblyHosted: isBlazorWebAssemblyHosted,
                    IsBlazorWebAssemblyStandalone: isBlazorWebAssemblyStandalone,
                }
            ],
        }
    };
}
