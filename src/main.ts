/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as OmniSharp from './omnisharp/extension';
import * as coreclrdebug from './coreclr-debug/activate';
import * as util from './common';
import * as vscode from 'vscode';

import { ActivationFailure, ActiveTextEditorChanged } from './omnisharp/loggingEvents';
import { WarningMessageObserver } from './observers/WarningMessageObserver';
import { CsharpChannelObserver } from './observers/CsharpChannelObserver';
import { CsharpLoggerObserver } from './observers/CsharpLoggerObserver';
import { DotNetChannelObserver } from './observers/DotnetChannelObserver';
import { DotnetLoggerObserver } from './observers/DotnetLoggerObserver';
import { EventStream } from './EventStream';
import { InformationMessageObserver } from './observers/InformationMessageObserver';
import { OmnisharpChannelObserver } from './observers/OmnisharpChannelObserver';
import { OmnisharpDebugModeLoggerObserver } from './observers/OmnisharpDebugModeLoggerObserver';
import { OmnisharpLoggerObserver } from './observers/OmnisharpLoggerObserver';
import { OmnisharpStatusBarObserver } from './observers/OmnisharpStatusBarObserver';
import { PlatformInformation } from './platform';
import { StatusBarItemAdapter } from './statusBarItemAdapter';
import { TelemetryObserver } from './observers/TelemetryObserver';
import TelemetryReporter from '@vscode/extension-telemetry';
import { addJSONProviders } from './features/json/jsonContributions';
import { ProjectStatusBarObserver } from './observers/ProjectStatusBarObserver';
import CSharpExtensionExports from './CSharpExtensionExports';
import { vscodeNetworkSettingsProvider } from './NetworkSettings';
import { ErrorMessageObserver } from './observers/ErrorMessageObserver';
import OptionProvider from './observers/OptionProvider';
import DotNetTestChannelObserver from './observers/DotnetTestChannelObserver';
import DotNetTestLoggerObserver from './observers/DotnetTestLoggerObserver';
import { ShowOmniSharpConfigChangePrompt } from './observers/OptionChangeObserver';
import createOptionStream from './observables/CreateOptionStream';
import { CSharpExtensionId } from './constants/CSharpExtensionId';
import { OpenURLObserver } from './observers/OpenURLObserver';
import { activateRazorExtension } from './razor/razor';
import { RazorLoggerObserver } from './observers/RazorLoggerObserver';
import { AbsolutePathPackage } from './packageManager/AbsolutePathPackage';
import { downloadAndInstallPackages } from './packageManager/downloadAndInstallPackages';
import IInstallDependencies from './packageManager/IInstallDependencies';
import { installRuntimeDependencies } from './InstallRuntimeDependencies';
import { isValidDownload } from './packageManager/isValidDownload';
import { BackgroundWorkStatusBarObserver } from './observers/BackgroundWorkStatusBarObserver';
import { getDotnetPackApi } from './DotnetPack';

export async function activate(context: vscode.ExtensionContext): Promise<CSharpExtensionExports | null> {

    const extensionVersion = context.extension.packageJSON.version;
    const aiKey = context.extension.packageJSON.contributes.debuggers[0].aiKey;
    const reporter = new TelemetryReporter(CSharpExtensionId, extensionVersion, aiKey);

    util.setExtensionPath(context.extension.extensionPath);

    const eventStream = new EventStream();

    let platformInfo: PlatformInformation;
    try {
        platformInfo = await PlatformInformation.GetCurrent();
    }
    catch (error) {
        eventStream.post(new ActivationFailure());
        throw error;
    }

    const optionStream = createOptionStream(vscode);
    let optionProvider = new OptionProvider(optionStream);

    let dotnetChannel = vscode.window.createOutputChannel('.NET');
    let dotnetChannelObserver = new DotNetChannelObserver(dotnetChannel);
    let dotnetLoggerObserver = new DotnetLoggerObserver(dotnetChannel);
    eventStream.subscribe(dotnetChannelObserver.post);
    eventStream.subscribe(dotnetLoggerObserver.post);

    let dotnetTestChannel = vscode.window.createOutputChannel(".NET Test Log");
    let dotnetTestChannelObserver = new DotNetTestChannelObserver(dotnetTestChannel);
    let dotnetTestLoggerObserver = new DotNetTestLoggerObserver(dotnetTestChannel);
    eventStream.subscribe(dotnetTestChannelObserver.post);
    eventStream.subscribe(dotnetTestLoggerObserver.post);

    let csharpChannel = vscode.window.createOutputChannel('C#');
    let csharpchannelObserver = new CsharpChannelObserver(csharpChannel);
    let csharpLogObserver = new CsharpLoggerObserver(csharpChannel);
    eventStream.subscribe(csharpchannelObserver.post);
    eventStream.subscribe(csharpLogObserver.post);

    let omnisharpChannel = vscode.window.createOutputChannel('OmniSharp Log');
    let omnisharpLogObserver = new OmnisharpLoggerObserver(omnisharpChannel, platformInfo);
    let omnisharpChannelObserver = new OmnisharpChannelObserver(omnisharpChannel, vscode);
    eventStream.subscribe(omnisharpLogObserver.post);
    eventStream.subscribe(omnisharpChannelObserver.post);

    let warningMessageObserver = new WarningMessageObserver(vscode, () => optionProvider.GetLatestOptions().disableMSBuildDiagnosticWarning || false);
    eventStream.subscribe(warningMessageObserver.post);

    let informationMessageObserver = new InformationMessageObserver(vscode);
    eventStream.subscribe(informationMessageObserver.post);

    let errorMessageObserver = new ErrorMessageObserver(vscode);
    eventStream.subscribe(errorMessageObserver.post);

    let omnisharpStatusBar = new StatusBarItemAdapter(vscode.window.createStatusBarItem("C#-Language-Service-Status", vscode.StatusBarAlignment.Left, Number.MIN_VALUE + 2));
    omnisharpStatusBar.name = "C# Language Service Status";
    let omnisharpStatusBarObserver = new OmnisharpStatusBarObserver(omnisharpStatusBar);
    eventStream.subscribe(omnisharpStatusBarObserver.post);

    let projectStatusBar = new StatusBarItemAdapter(vscode.window.createStatusBarItem("C#-Project-Selector", vscode.StatusBarAlignment.Left, Number.MIN_VALUE + 1));
    projectStatusBar.name = "C# Project Selector";
    let projectStatusBarObserver = new ProjectStatusBarObserver(projectStatusBar);
    eventStream.subscribe(projectStatusBarObserver.post);

    let backgroundWorkStatusBar = new StatusBarItemAdapter(vscode.window.createStatusBarItem("C#-Code-Analysis", vscode.StatusBarAlignment.Left, Number.MIN_VALUE));
    backgroundWorkStatusBar.name = "C# Code Analysis";
    let backgroundWorkStatusBarObserver = new BackgroundWorkStatusBarObserver(backgroundWorkStatusBar);
    eventStream.subscribe(backgroundWorkStatusBarObserver.post);

    let openURLObserver = new OpenURLObserver(vscode);
    eventStream.subscribe(openURLObserver.post);

    const debugMode = false;
    if (debugMode) {
        let omnisharpDebugModeLoggerObserver = new OmnisharpDebugModeLoggerObserver(omnisharpChannel);
        eventStream.subscribe(omnisharpDebugModeLoggerObserver.post);
    }

    if (!isSupportedPlatform(platformInfo)) {
        let errorMessage: string = `The C# extension for Visual Studio Code (powered by OmniSharp) is incompatible on ${platformInfo.platform} ${platformInfo.architecture}`;

        // Check to see if VS Code is running remotely
        if (context.extension.extensionKind === vscode.ExtensionKind.Workspace) {
            const setupButton: string = "How to setup Remote Debugging";
            errorMessage += ` with the VS Code Remote Extensions. To see avaliable workarounds, click on '${setupButton}'.`;

            await vscode.window.showErrorMessage(errorMessage, setupButton).then(selectedItem => {
                if (selectedItem === setupButton) {
                    const remoteDebugInfoURL = 'https://github.com/OmniSharp/omnisharp-vscode/wiki/Remote-Debugging-On-Linux-Arm';
                    vscode.env.openExternal(vscode.Uri.parse(remoteDebugInfoURL));
                }
            });
        } else {
            await vscode.window.showErrorMessage(errorMessage);
        }

        // Unsupported platform
        return null;
    }

    // If the dotnet bundle is installed, this will ensure the dotnet CLI is on the path.
    await initializeDotnetPath();

    let useModernNetOption = optionProvider.GetLatestOptions().useModernNet;
    let telemetryObserver = new TelemetryObserver(platformInfo, () => reporter, useModernNetOption);
    eventStream.subscribe(telemetryObserver.post);

    let networkSettingsProvider = vscodeNetworkSettingsProvider(vscode);
    const useFramework = useModernNetOption !== true;
    let installDependencies: IInstallDependencies = async (dependencies: AbsolutePathPackage[]) => downloadAndInstallPackages(dependencies, networkSettingsProvider, eventStream, isValidDownload, useFramework);
    let runtimeDependenciesExist = await ensureRuntimeDependencies(context.extension, eventStream, platformInfo, installDependencies, useFramework);

    // activate language services
    let langServicePromise = OmniSharp.activate(context, context.extension.packageJSON, platformInfo, networkSettingsProvider, eventStream, optionProvider, context.extension.extensionPath);

    // register JSON completion & hover providers for project.json
    context.subscriptions.push(addJSONProviders());
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        eventStream.post(new ActiveTextEditorChanged());
    }));

    context.subscriptions.push(optionProvider);
    context.subscriptions.push(ShowOmniSharpConfigChangePrompt(optionStream, vscode));

    let coreClrDebugPromise = Promise.resolve();
    if (runtimeDependenciesExist) {
        // activate coreclr-debug
        coreClrDebugPromise = coreclrdebug.activate(context.extension, context, platformInfo, eventStream, optionProvider.GetLatestOptions());
    }

    let razorPromise = Promise.resolve();
    if (!optionProvider.GetLatestOptions().razorDisabled) {
        const razorObserver = new RazorLoggerObserver(omnisharpChannel);
        eventStream.subscribe(razorObserver.post);

        if (!optionProvider.GetLatestOptions().razorDevMode) {
            razorPromise = activateRazorExtension(context, context.extension.extensionPath, eventStream);
        }
    }

    return {
        initializationFinished: async () => {
            let langService = await langServicePromise;
            await langService.server.waitForEmptyEventQueue();
            await coreClrDebugPromise;
            await razorPromise;
        },
        getAdvisor: async () => {
            let langService = await langServicePromise;
            return langService.advisor;
        },
        getTestManager: async () => {
            let langService = await langServicePromise;
            return langService.testManager;
        },
        eventStream
    };
}

function isSupportedPlatform(platform: PlatformInformation): boolean {
    if (platform.isWindows()) {
        return platform.architecture === "x86" || platform.architecture === "x86_64" || platform.architecture === "arm64";
    }

    if (platform.isMacOS()) {
        return true;
    }

    if (platform.isLinux()) {
        return platform.architecture === "x86_64" ||
            platform.architecture === "x86" ||
            platform.architecture === "i686" ||
            platform.architecture === "arm64";
    }

    return false;
}

async function ensureRuntimeDependencies(extension: vscode.Extension<CSharpExtensionExports>, eventStream: EventStream, platformInfo: PlatformInformation, installDependencies: IInstallDependencies, useFramework: boolean): Promise<boolean> {
    return installRuntimeDependencies(extension.packageJSON, extension.extensionPath, installDependencies, eventStream, platformInfo, useFramework);
}

async function initializeDotnetPath(): Promise<void> {
    const dotnetPackApi = await getDotnetPackApi();
    if (dotnetPackApi !== undefined) {
        await dotnetPackApi.getDotnetPath();
    }
}
