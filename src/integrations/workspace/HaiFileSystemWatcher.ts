import Watcher from "watcher";
import * as path from "path";
import * as fs from "fs/promises";
import ignore from "ignore";
import { HaiBuildDefaults } from "../../shared/haiDefaults";
import { ClineProvider } from "../../core/webview/ClineProvider";
import { FileOperations } from "../../utils/constants";

class HaiFileSystemWatcher {
    private sourceFolder: string;
    private ig: ReturnType<typeof ignore>;
    private providerRef: WeakRef<ClineProvider>

    constructor(provider: ClineProvider, sourceFolder: string) {
        this.sourceFolder = sourceFolder;
        this.providerRef = new WeakRef(provider)
        this.ig = ignore();
        this.initializeWatcher().then();
    }

    private async loadGitIgnore() {
        try {
            const gitignorePath = path.join(this.sourceFolder, ".gitignore");
            const content = await fs.readFile(gitignorePath, "utf-8");

            // Add patterns from .gitignore
            this.ig.add(
                content
                    .split("\n")
                    .filter((line) => line.trim() && !line.startsWith("#"))
            )
        } catch (error) {
            console.log("HaiFileSystemWatcher No .gitignore found, using default exclusions.");
        }

        // Add default exclusions
        this.ig.add([...HaiBuildDefaults.defaultDirsToIgnore, HaiBuildDefaults.defaultContextDirectory]);
    }

    private async initializeWatcher() {
        await this.loadGitIgnore();

        const watcher = new Watcher(this.sourceFolder, {
            recursive: true,
            debounce: 3000,
            ignoreInitial: true,
            ignore: (targetPath: string) => {
                if (!targetPath || targetPath.trim() === "") {
                    console.warn("HaiFileSystemWatcher Ignoring empty or invalid path.");
                    return true; // Exclude invalid paths
                }
    
                const relativePath = path.relative(this.sourceFolder, targetPath);
    
                // Ensure the path is inside the workspace folder
                if (relativePath.startsWith("..")) {
                    console.warn(`HaiFileSystemWatcher Path ${targetPath} is outside the workspace folder.`);
                    return true; // Ignore paths outside the workspace
                }
    
                // Handle workspace folder itself
                if (relativePath === "") {
                    return false; // Don't ignore the root workspace folder
                }
    
                // Use the ignore package to check for excluded paths
                const isIgnored = this.ig.ignores(relativePath);
                // console.debug(`HaiFileSystemWatcher Path ${relativePath} ignored: ${isIgnored}`);
                return isIgnored;
            },
        });
    
        watcher.on("unlink", filePath => {
            console.log("HaiFileSystemWatcher File deleted", filePath);
            this.providerRef.deref()?.invokeReindex([filePath], FileOperations.Delete);
        });

        watcher.on("add", filePath => {
            console.log("HaiFileSystemWatcher File added", filePath);
            this.providerRef.deref()?.invokeReindex([filePath], FileOperations.Create);
        });

        watcher.on("change", filePath => {
            console.log("HaiFileSystemWatcher File changes", filePath);
            this.providerRef.deref()?.invokeReindex([filePath], FileOperations.Change);
        });

        watcher.on("addDir", filePath => {
            let value = filePath.split('/').pop() === HaiBuildDefaults.defaultInstructionsDirectory
            console.log("HaiFileSystemWatcher Folder added", value);
            if (value) {
                this.providerRef.deref()?.checkInstructionFilesFromFileSystem();
            }
        });

        watcher.on("unlinkDir", filePath => {
            let value = filePath.split('/').pop() === ".vscode" || filePath.split('/').pop() === HaiBuildDefaults.defaultInstructionsDirectory
            console.log("HaiFileSystemWatcher Folder deleted", value);
            if (value) {
                this.providerRef.deref()?.updateFileInstructions([]);
            }
        });

    }
}

export default HaiFileSystemWatcher;
