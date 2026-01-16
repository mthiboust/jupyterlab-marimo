import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";

import {
  IDocumentWidget,
  DocumentRegistry,
  DocumentWidget,
  ABCWidgetFactory,
} from "@jupyterlab/docregistry";

import { IFileBrowserFactory } from "@jupyterlab/filebrowser";

import { ILauncher } from "@jupyterlab/launcher";

import { ServerConnection } from "@jupyterlab/services";

import { Widget } from "@lumino/widgets";

import { Message } from "@lumino/messaging";

import { pythonIcon, LabIcon } from "@jupyterlab/ui-components";

import marimoIconSvgStr from "../style/marimo-icon.svg";
import marimoLauncherIconSvgStr from "../style/marimo-launcher-icon.svg";

/**
 * The MIME type for Marimo files.
 */
const MARIMO_MIME_TYPE = "text/x-python";
const MARIMO_FILE_EXTENSION = ".mo.py";
const PYTHON_FILE_EXTENSION = ".py";

/**
 * Detect if JupyterLab is currently in dark mode.
 * JupyterLab sets the data-jp-theme-light attribute on body to "true" or "false".
 */
function isJupyterLabDarkTheme(): boolean {
  const themeLight = document.body.getAttribute("data-jp-theme-light");
  return themeLight === "false";
}

/**
 * Apply theme to an iframe by setting the data-vscode-theme-kind attribute.
 * Marimo has built-in support for VS Code theme detection via this attribute,
 * which takes precedence over user config settings.
 */
function applyThemeToIframe(
  iframe: HTMLIFrameElement,
  isDark: boolean,
): boolean {
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc || !iframeDoc.body) {
      return false;
    }

    // Set data-vscode-theme-kind attribute which marimo watches via MutationObserver
    // This takes precedence over marimo's user config theme setting
    iframeDoc.body.dataset.vscodeThemeKind = isDark
      ? "vscode-dark"
      : "vscode-light";

    return true;
  } catch (error) {
    // Cross-origin restriction - iframe not accessible
    console.warn("Cannot access iframe document for theme sync:", error);
    return false;
  }
}

/**
 * The Marimo icon for file browser and tabs.
 * SVG is loaded from style/marimo-icon.svg
 */
const marimoIcon = new LabIcon({
  name: "marimo:icon",
  svgstr: marimoIconSvgStr,
});

/**
 * A widget for displaying Marimo editor in an iframe.
 */
class MarimoEditorWidget extends Widget {
  private _context: DocumentRegistry.Context;
  private _iframe: HTMLIFrameElement;
  private _errorDiv: HTMLDivElement;
  private _marimoUrl: string | null = null;
  private _themeObserver: MutationObserver | null = null;
  private _currentThemeIsDark: boolean = false;

  constructor(context: DocumentRegistry.Context) {
    super();
    this._context = context;
    this.addClass("marimo-editor-widget");
    this.title.label = context.localPath;
    this.title.closable = true;
    this.title.icon = marimoIcon;

    // Create error message div (hidden by default)
    this._errorDiv = document.createElement("div");
    this._errorDiv.className = "marimo-error-message";
    this._errorDiv.style.display = "none";
    this.node.appendChild(this._errorDiv);

    // Create iframe
    this._iframe = document.createElement("iframe");
    this._iframe.className = "marimo-iframe";
    this._iframe.style.width = "100%";
    this._iframe.style.height = "100%";
    this._iframe.style.border = "none";
    this.node.appendChild(this._iframe);

    // Initialize theme tracking
    this._currentThemeIsDark = isJupyterLabDarkTheme();

    // Initialize the Marimo URL
    this._initializeMarimoUrl();

    // Set up theme observer to watch for JupyterLab theme changes
    this._setupThemeObserver();
  }

  /**
   * Set up a MutationObserver to watch for JupyterLab theme changes.
   * Watches for changes to data-jp-theme-light, data-jp-theme-name, and class attributes.
   */
  private _setupThemeObserver(): void {
    this._themeObserver = new MutationObserver(() => {
      const isDark = isJupyterLabDarkTheme();
      if (isDark !== this._currentThemeIsDark) {
        this._currentThemeIsDark = isDark;
        this._syncThemeToIframe();
      }
    });

    // Observe the body element for theme-related attribute changes
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: [
        "data-jp-theme-light",
        "data-jp-theme-name",
        "class",
        "style",
      ],
    });
  }

  /**
   * Synchronize the current JupyterLab theme to the marimo iframe.
   */
  private _syncThemeToIframe(): void {
    if (applyThemeToIframe(this._iframe, this._currentThemeIsDark)) {
      console.log(
        `Synced theme to marimo iframe: ${this._currentThemeIsDark ? "dark" : "light"}`,
      );
    }
  }

  /**
   * Initialize the Marimo URL by constructing the proxied URL.
   */
  private async _initializeMarimoUrl(): Promise<void> {
    try {
      const filePath = this._context.path;
      const settings = ServerConnection.makeSettings();
      const baseUrl = settings.baseUrl;

      // Construct the Marimo proxy URL
      // The jupyter-marimo-proxy typically serves at /marimo/
      // We pass the file path as a query parameter
      // Note: The exact URL structure depends on how jupyter-marimo-proxy is configured
      // Common patterns:
      // 1. /marimo/?file=<path>
      // 2. /marimo/edit?file=<path>
      // 3. /proxy/absolute/<port>/marimo/edit?file=<path>

      // First, check if Marimo proxy is available
      const marimoAvailable = await this._checkMarimoAvailability(baseUrl);

      if (!marimoAvailable) {
        this._showError(
          "Marimo proxy is not available. Please ensure:\n" +
            "1. marimo>=0.6.21 is installed (pip install marimo>=0.6.21)\n" +
            "2. jupyter-marimo-proxy is installed (pip install jupyter-marimo-proxy)\n" +
            "3. JupyterLab has been restarted after installation",
        );
        return;
      }

      // Encode the file path for URL
      const encodedPath = encodeURIComponent(filePath);

      // Try different URL patterns that jupyter-marimo-proxy might use
      // Pattern 1: /marimo/ endpoint with file parameter
      this._marimoUrl = `${baseUrl}marimo/?file=${encodedPath}`;

      console.log(`Loading Marimo editor for file: ${filePath}`);
      console.log(`Marimo URL: ${this._marimoUrl}`);

      this._iframe.src = this._marimoUrl;

      // Add load event listener to sync theme and handle errors
      this._iframe.addEventListener("load", () => {
        console.log("Marimo iframe loaded successfully");
        // Sync theme after iframe loads (with a small delay to ensure marimo is ready)
        setTimeout(() => {
          this._syncThemeToIframe();
        }, 500);
      });

      this._iframe.addEventListener("error", (e) => {
        console.error("Error loading Marimo iframe:", e);
        this._showError(
          "Failed to load Marimo editor. Please check:\n" +
            "1. The file path is correct\n" +
            "2. Marimo proxy is running\n" +
            "3. Browser console for detailed errors",
        );
      });
    } catch (error) {
      console.error("Error initializing Marimo URL:", error);
      this._showError(
        `Error initializing Marimo editor: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if Marimo proxy is available.
   */
  private async _checkMarimoAvailability(baseUrl: string): Promise<boolean> {
    try {
      // Try to fetch the Marimo proxy endpoint
      const response = await fetch(`${baseUrl}marimo/`, {
        method: "HEAD",
        cache: "no-cache",
      });
      return response.ok || response.status === 404; // 404 is ok, means endpoint exists
    } catch (error) {
      console.warn("Marimo proxy check failed:", error);
      // If fetch fails, we'll still try to load it and let the iframe handle the error
      return true;
    }
  }

  /**
   * Show an error message to the user.
   */
  private _showError(message: string): void {
    this._errorDiv.textContent = message;
    this._errorDiv.style.display = "block";
    this._iframe.style.display = "none";
  }

  /**
   * Handle after-attach messages.
   */
  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
  }

  /**
   * Handle before-detach messages.
   */
  protected onBeforeDetach(msg: Message): void {
    super.onBeforeDetach(msg);
  }

  /**
   * Handle resize messages.
   */
  protected onResize(): void {
    // Widget has been resized
  }

  /**
   * Dispose of the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    // Clean up the theme observer
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
    this._iframe.src = "";
    super.dispose();
  }

  /**
   * Get the context for the widget.
   */
  get context(): DocumentRegistry.Context {
    return this._context;
  }
}

/**
 * A widget factory for Marimo editor widgets.
 */
class MarimoEditorFactory extends ABCWidgetFactory<
  IDocumentWidget<MarimoEditorWidget>
> {
  /**
   * Create a new widget given a context.
   */
  protected createNewWidget(
    context: DocumentRegistry.Context,
  ): IDocumentWidget<MarimoEditorWidget> {
    const content = new MarimoEditorWidget(context);
    const widget = new DocumentWidget({ content, context });
    widget.addClass("marimo-document-widget");
    widget.title.icon = marimoIcon;
    return widget;
  }
}

/**
 * The Marimo file type for .mo.py files.
 */
const marimoFileType: Partial<DocumentRegistry.IFileType> = {
  name: "marimo",
  displayName: "Marimo Notebook",
  mimeTypes: [MARIMO_MIME_TYPE],
  extensions: [MARIMO_FILE_EXTENSION],
  fileFormat: "text",
  contentType: "file",
  icon: marimoIcon,
};

/**
 * The Python file type for opening .py files in Marimo (non-default).
 */
const pythonMarimoFileType: Partial<DocumentRegistry.IFileType> = {
  name: "python-marimo",
  displayName: "Python (Marimo)",
  mimeTypes: [MARIMO_MIME_TYPE],
  extensions: [PYTHON_FILE_EXTENSION],
  fileFormat: "text",
  contentType: "file",
  icon: pythonIcon,
};

/**
 * Default content for a new Marimo notebook.
 * This creates a minimal valid marimo notebook structure.
 */
const DEFAULT_MARIMO_CONTENT = `import marimo

app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    return (mo,)


if __name__ == "__main__":
    app.run()
`;

/**
 * Initialization data for the jupyterlab-marimo extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: "jupyterlab-marimo:plugin",
  description:
    "A JupyterLab extension to open Marimo files in an embbeded Marimo editor",
  autoStart: true,
  requires: [IFileBrowserFactory],
  optional: [ILauncher],
  activate: (
    app: JupyterFrontEnd,
    browserFactory: IFileBrowserFactory,
    launcher: ILauncher | null,
  ) => {
    console.log("JupyterLab extension jupyterlab-marimo is activated!");

    const { docRegistry, serviceManager } = app;

    // Add the Marimo file type for .mo.py files
    docRegistry.addFileType(marimoFileType as DocumentRegistry.IFileType);

    // Add the Python-Marimo file type for .py files (non-default, appears in "Open With")
    docRegistry.addFileType(pythonMarimoFileType as DocumentRegistry.IFileType);

    // Create and register the widget factory
    // - fileTypes: includes both marimo (.mo.py) and python-marimo (.py)
    // - defaultFor: only marimo, so .py files use standard editor by default
    const factory = new MarimoEditorFactory({
      name: "Marimo Editor",
      fileTypes: ["marimo", "python-marimo"],
      defaultFor: ["marimo"],
      readOnly: false,
    });

    // Register the factory
    docRegistry.addWidgetFactory(factory);

    console.log("Marimo editor factory registered for .mo.py and .py files");

    // Command to create a new Marimo notebook
    app.commands.addCommand("marimo:create-new", {
      label: "Marimo Notebook",
      caption: "Create a new Marimo notebook",
      icon: marimoIcon,
      execute: async () => {
        // Get the current working directory from the file browser
        const cwd = browserFactory.tracker.currentWidget?.model.path ?? "";

        // Generate a unique filename using a single directory listing
        const contents = serviceManager.contents;
        const baseFilename = "Untitled";
        const extension = ".mo.py";

        // Get existing files in the directory with a single API call
        let existingNames: Set<string>;
        try {
          const dirModel = await contents.get(cwd || ".", { content: true });
          if (dirModel.type === "directory" && dirModel.content) {
            existingNames = new Set(
              (dirModel.content as { name: string }[]).map((item) => item.name),
            );
          } else {
            existingNames = new Set();
          }
        } catch {
          // If directory listing fails, start with empty set
          existingNames = new Set();
        }

        // Find first available filename
        let filename = `${baseFilename}${extension}`;
        let counter = 1;
        while (existingNames.has(filename)) {
          filename = `${baseFilename}${counter}${extension}`;
          counter++;
        }

        const filePath = cwd ? `${cwd}/${filename}` : filename;

        // Create the new file with default Marimo content
        await contents.save(filePath, {
          type: "file",
          format: "text",
          content: DEFAULT_MARIMO_CONTENT,
        });

        // Open the file with Marimo Editor
        await app.commands.execute("docmanager:open", {
          path: filePath,
          factory: "Marimo Editor",
        });

        console.log(`Created and opened new Marimo notebook: ${filePath}`);
      },
    });

    // Add to launcher if available
    if (launcher) {
      // Create a data URL from the marimo logo SVG for the launcher icon
      // The launcher doesn't use the command's icon property - it needs kernelIconUrl
      const iconDataUrl = `data:image/svg+xml,${encodeURIComponent(marimoLauncherIconSvgStr)}`;

      launcher.add({
        command: "marimo:create-new",
        category: "Notebook",
        rank: 2, // Place after Jupyter Notebook but before Console
        kernelIconUrl: iconDataUrl,
      });
      console.log("Marimo launcher item added");
    }

    // Command to open existing files in Marimo
    app.commands.addCommand("marimo:open", {
      label: "Open in Marimo",
      caption: "Open the current file in Marimo editor",
      icon: marimoIcon,
      execute: (args) => {
        let path = args["path"] as string | undefined;

        // If no path provided, try to get it from the file browser
        if (!path) {
          const widget = browserFactory.tracker.currentWidget;
          if (widget) {
            const selectedItems = Array.from(widget.selectedItems());
            if (selectedItems.length > 0) {
              path = selectedItems[0].path;
            }
          }
        }

        // Allow both .mo.py and .py files to be opened in Marimo
        if (
          path &&
          (path.endsWith(MARIMO_FILE_EXTENSION) ||
            path.endsWith(PYTHON_FILE_EXTENSION))
        ) {
          console.log(`Opening ${path} in Marimo editor`);
          app.commands.execute("docmanager:open", {
            path,
            factory: "Marimo Editor",
          });
        } else {
          console.warn(`Cannot open file in Marimo: ${path}`);
        }
      },
    });

    // Add context menu item for .mo.py files
    app.contextMenu.addItem({
      command: "marimo:open",
      selector: '.jp-DirListing-item[data-file-type="marimo"]',
      rank: 0,
    });

    // Add context menu item for .py files
    app.contextMenu.addItem({
      command: "marimo:open",
      selector: '.jp-DirListing-item[data-file-type="python-marimo"]',
      rank: 0,
    });

    console.log("Marimo context menu items added");
  },
};

export default plugin;
