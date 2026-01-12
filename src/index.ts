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

import { ServerConnection } from "@jupyterlab/services";

import { Widget } from "@lumino/widgets";

import { Message } from "@lumino/messaging";

import { pythonIcon } from "@jupyterlab/ui-components";

/**
 * The MIME type for Marimo files.
 */
const MARIMO_MIME_TYPE = "text/x-python";
const MARIMO_FILE_EXTENSION = ".mo.py";

/**
 * A widget for displaying Marimo editor in an iframe.
 */
class MarimoEditorWidget extends Widget {
  private _context: DocumentRegistry.Context;
  private _iframe: HTMLIFrameElement;
  private _errorDiv: HTMLDivElement;
  private _marimoUrl: string | null = null;

  constructor(context: DocumentRegistry.Context) {
    super();
    this._context = context;
    this.addClass("marimo-editor-widget");
    this.title.label = context.localPath;
    this.title.closable = true;
    this.title.icon = pythonIcon;

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

    // Initialize the Marimo URL
    this._initializeMarimoUrl();
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

      // Add load event listener to handle errors
      this._iframe.addEventListener("load", () => {
        console.log("Marimo iframe loaded successfully");
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
    widget.title.icon = pythonIcon;
    return widget;
  }
}

/**
 * The Marimo file type.
 */
const marimoFileType: Partial<DocumentRegistry.IFileType> = {
  name: "marimo",
  displayName: "Marimo Notebook",
  mimeTypes: [MARIMO_MIME_TYPE],
  extensions: [MARIMO_FILE_EXTENSION],
  fileFormat: "text",
  contentType: "file",
  icon: pythonIcon,
};

/**
 * Initialization data for the jupyterlab-marimo extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: "jupyterlab-marimo:plugin",
  description:
    "A JupyterLab extension to open Marimo files in an embbeded Marimo editor",
  autoStart: true,
  requires: [IFileBrowserFactory],
  activate: (app: JupyterFrontEnd, browserFactory: IFileBrowserFactory) => {
    console.log("JupyterLab extension jupyterlab-marimo is activated!");

    const { docRegistry } = app;

    // Add the Marimo file type
    docRegistry.addFileType(marimoFileType as DocumentRegistry.IFileType);

    // Create and register the widget factory
    const factory = new MarimoEditorFactory({
      name: "Marimo Editor",
      fileTypes: ["marimo"],
      defaultFor: ["marimo"],
      readOnly: false,
    });

    // Register the factory
    docRegistry.addWidgetFactory(factory);

    console.log("Marimo editor factory registered for .mo.py files");

    // Optional: Add a command to open files in Marimo
    app.commands.addCommand("marimo:open", {
      label: "Open in Marimo",
      caption: "Open the current file in Marimo editor",
      icon: pythonIcon,
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

        if (path && path.endsWith(MARIMO_FILE_EXTENSION)) {
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

    console.log("Marimo context menu items added");
  },
};

export default plugin;
