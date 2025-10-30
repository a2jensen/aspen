/* eslint-disable curly */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable prettier/prettier */
/**
 * This file acts as the main entry point of the extension, where you import and export all your plugins or extensions.
 * It registers the UI components, commands and CodeMirror extension.
 */
import {
  ILayoutRestorer, // Restore widgets layout and state on refresh
  JupyterFrontEnd, // Main JupyterLab application interface
  JupyterFrontEndPlugin // Interface for JupyterLab plugins
} from "@jupyterlab/application"
import {TemplatesManager} from "./TemplatesManager";
import {ContentsManager} from "@jupyterlab/services";
import {LibraryWidget} from "./LibraryWidget";
import {SnippetsManager} from "./snippetManager";
import { TextboxesManager } from './TextboxesManager';
import {Synchronization} from "./Synchronization";
import {CodeMirrorExtension} from "./CodeMirrorPlugin";
import {IEditorExtensionRegistry} from "@jupyterlab/codemirror"; // Interface for registering CodeMirror Extensions
import {INotebookTracker} from "@jupyterlab/notebook";
import { Cell } from '@jupyterlab/cells';


function addCellIdAttribute(cell: Cell): void {
  if (!cell.model || !cell.node) {return;}
  const cellId = cell.model.id;
  cell.node.setAttribute('data-cell-id', cellId);
}

/**
 * Activation function for our extension. Function is called
 * when the extension is activated by Jupyter Lab.
 * 
 * @param app app - The JupyterFrontEnd application instance
 * @param restorer restorer - The layout restorer service for preserving widget state
 * @param extensions extensions - The registry for CodeMirror editor extensions
 */

async function activate(app: JupyterFrontEnd, restorer: ILayoutRestorer, extensions: IEditorExtensionRegistry, notebookTracker: INotebookTracker) {
  console.log("activating");
  const {commands} = app;

  const contentsManager = new ContentsManager();
  const templatesManager = new TemplatesManager(contentsManager);
  const snippetsManager = new SnippetsManager(contentsManager, templatesManager);
  const textboxesManager = new TextboxesManager(templatesManager, snippetsManager,);
  const libraryWidget = new LibraryWidget(templatesManager, snippetsManager, textboxesManager);
  const synchronization = new Synchronization(templatesManager, snippetsManager, libraryWidget);
  libraryWidget.setSynchronization(synchronization);
  textboxesManager.setLibraryWidget(libraryWidget) // setting widget

  libraryWidget.id = "jupyterlab-librarywidget-sidebarRight";
  libraryWidget.title.iconClass = "jp-SideBar-tabIcon"; 
  libraryWidget.title.caption = "Library display of templates";
  await libraryWidget.loadTemplates();

  notebookTracker.widgetAdded.connect((_, notebookPanel) => {
    notebookPanel.content.widgets.forEach(cell => {
    addCellIdAttribute(cell);
  });

  notebookPanel.content.model?.cells.changed.connect((_, change) => {
    if (change.type === 'add') {
      change.newValues.forEach((_, i) => {
        const cell = notebookPanel.content.widgets[change.newIndex + i];
        addCellIdAttribute(cell);
      });
    }
  });

});


  

  /**
   * Event Listener for when a template is copied from the library.
   * Before getting saved to the clipboard, we want to attach a marker as well as its ID onto it in JSON format.
   * @param event - The ClipboardEvent object containing information about the copy action
   * @property {DataTransfer} event.clipboardData - The DataTransfer object that provides access to data on the clipboard
   *   Methods include:
   *     - setData(format, data): Sets data of the specified format onto the clipboard
   *     - getData(format): Retrieves data of the specified format from the clipboard
   *     - clearData([format]): Removes data of the specified format or all formats
   */

  /**
   * Event Listener for when a template is dragged from the library.
   * 
   * Before getting saved to dataTransfer, we want to attach a marker as well as its ID onto it in JSON format.
   * 
   */
  document.addEventListener("dragstart", (event) => {
    const dragInfo = event.target as HTMLElement;

    if (dragInfo.classList.contains("template-snippet")) {

      const templateData = {
        marker: "aspen-template",
        templateID: dragInfo.getAttribute("data-template-id"),
        content: dragInfo.innerText
      }

      const content = templatesManager.getContent(templateData.templateID!);
      templateData.content = content;
     
      // console.log("Data that will be set onto the dataTransfer", templateData);
      event.dataTransfer?.setData("application/json", JSON.stringify(templateData));
      event.dataTransfer?.setData("text/plain", templateData.content);

    }
  })

  /**
   * Adding command that allows their highlighted code to be saved as a template.
   */
  commands.addCommand("templates:create", {
    label: "Save Code Snippet",
    execute: async () => {
      try {
        const snippet = window.getSelection()?.toString().trim() || "";
        if (!snippet) {
          console.warn("No code snippet selected.");
          return;
        }

        const template = await libraryWidget.createTemplate(snippet);
        if (!template) {
          console.error("Failed to create template.");
          return;
        }

        document.dispatchEvent(
          new CustomEvent("Save Code Snippet", {
            detail: {
              snippetText: snippet,
              templateID: template.id
            }
          })
        );

        console.log("Snippet saved successfully:", template.id);
      } catch (error: unknown) {
        console.error("Template creation failed:", error);
      }
    }
  });

  commands.addCommand("templates:push", {
    label: "Push Changes To Template",
    execute: () => {
      const content = window.getSelection();
      if (content?.rangeCount === 0 || !content) {
        return;
      }

      /**
       * Query the highlighted DOM and check if the instance is within it
       */
      const range = content.getRangeAt(0);
      // https://developer.mozilla.org/en-US/docs/Web/API/Range/cloneContents
      const fragment = range.cloneContents(); // DOM fragment of the selection, making a deep copy of DOM so we don't directly edit the base DOM

      // Create a temporary wrapper to check for class names, acts as a temporary "mini-DOM" where we can make edits
      const tempDiv = document.createElement("div");
      tempDiv.appendChild(fragment);

      const startCheck = tempDiv.querySelector(".snippet-start-line");
      const endCheck = tempDiv.querySelector(".snippet-end-line");
      
      
      if (startCheck && endCheck) {
        /**
         * Grab the needed data and pass it into the synch function
         */
        const templateId = startCheck?.getAttribute("data-associated-template");

        // Get all lines inside the tempDiv / highlighted snippet
        const codeLines = Array.from(tempDiv.querySelectorAll('.cm-line'))
          .map(lineEl => (lineEl as HTMLElement).innerText.trimEnd());
        const innerText = codeLines.join("\n"); // Explicitly join lines with \n


        if (templateId) {
          // temporary fix, do something like LibraryWidget.synch. similar to create above
          // TODO: handle the textbox edit case here!
          synchronization.sync(templateId, innerText, true);
        }
      }
      
      return;
    }
  })

  commands.addCommand('templates:unsync', {
    label: 'Unsync',
    execute: () => {
      // find if the cursor is within a snippet
      const selection = window.getSelection();

      if (!selection){
        console.warn("Invalid window selection")
        return
      }

      const snippetCheck = snippetHighlighted(selection)

      if (!snippetCheck.highlighted){
        console.warn("highlighted content was not identified as an instance");
        return;
      }

      if (!snippetCheck.startDiv){
        console.warn("invalid start div for the highlighted content");
        return;
      }

      const snippetId = snippetCheck.startDiv.getAttribute('data-snippet-id');
      if (!snippetId) {
        console.warn("No snippet ID found.");
        return;
      }

      snippetsManager.unsync(snippetId);
    }
  });

  /** Adding the templates:create command to their respective context menus */
  app.contextMenu.addItem({
    command: "templates:create",
    selector: ".jp-Notebook",
    rank : 1
  });

  app.contextMenu.addItem({
    command: "templates:push",
    selector: ".jp-Notebook",
    rank: 1
  });
  app.contextMenu.addItem({
    command: 'templates:unsync',
    selector: '.jp-Notebook',
    rank: 1
  });

  
  /** Registers Library Widget to the right sidebar. */
  app.shell.add(libraryWidget, "right", {rank: 300});

  /** Registers the library widget with the layout restorer to
   * preserve its state across page reloads and sessions. */
  restorer.add(libraryWidget, "custom-sidebar-widget");

  /** Registers the CodeMirror Extension for snippet instance visualization and management. */
  extensions.addExtension({
    name: "@aspen/codemirror_plugin",
    factory: () => ({
      extension: CodeMirrorExtension(synchronization, snippetsManager, textboxesManager, notebookTracker),
      instance: () => CodeMirrorExtension(synchronization, snippetsManager, textboxesManager, notebookTracker),
      reconfigure: () => null
    })
  });
}

/**
 * JupyterLab Plugin Definition
 * 
 * Defines the entry point for the JupyterLab extension.
 * This object tells JupyterLab how to find and initialize the extension.
 */
const aspen: JupyterFrontEndPlugin<void> = {
  id: "aspen-extension",
  autoStart: true,
  requires: [ILayoutRestorer, IEditorExtensionRegistry, INotebookTracker],
  activate: activate
};

export default aspen;

function snippetHighlighted( content : Selection ) : { highlighted : boolean, startDiv : Element | null} {
  const range = content.getRangeAt(0);
  const fragment = range.cloneContents();
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);

  const startCheck = tempDiv.querySelector('.snippet-start-line');
  const endCheck = tempDiv.querySelector('.snippet-end-line');
  
  if (startCheck && endCheck) {
    return {
      highlighted : true,
      startDiv: startCheck
    }
  } else {
    return {
      highlighted : false,
      startDiv : null
    }
  }
}