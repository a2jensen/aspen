/* eslint-disable curly */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable prettier/prettier */
import { Extension } from '@codemirror/state';
import {
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  keymap
} from '@codemirror/view';
import { SnippetsManager } from './snippetManager';
import { defaultKeymap} from '@codemirror/commands';
import { customKeymap } from './customkeyBinds';
import { INotebookTracker } from "@jupyterlab/notebook"

// Create a global flag to track if the event listener has been registered
let saveSnippetListenerRegistered = false;
let currentView: EditorView | null = null;

 function getCellIdFromEditor(view: EditorView | undefined): string | undefined {
  if (!view) {
    console.warn("EditorView is undefined — cannot get cell ID");
    return undefined;
  }
  const cellElement = view.dom.closest('[data-cell-id]');
  if (!cellElement) {
    console.warn("Unable to find the cellElement");
    return undefined;
  }
  return cellElement.getAttribute('data-cell-id') ?? undefined;
}

/**
 * 
 * This serves as the main entry point for integrating CodeMirror into the ASPEN extension.
 * This plugin integrates the SnippetsManager Class with CodeMirror's view system, evidenced by the function taking in a SnippetsManager prop.
 * It is in charge of handling editor events, and applying/updating decorations to snippet instances when the view updates appropriately.
 * 
 * @param snippetsManager 
 * @returns ViewPluginExtension. Create a plugin for a class whose constructor takes a single editor view as argument.
 */
export function CodeMirrorExtension(snippetsManager: SnippetsManager, notebookTracker : INotebookTracker): Extension {
  if(!saveSnippetListenerRegistered){
    saveSnippetListenerRegistered = true;

    // This event listener will now be registered only once
    document.addEventListener(
      "Save Code Snippet",
      (event: Event) => {
        const { templateID } = (event as CustomEvent<{ templateID: string }>).detail;

        if (!currentView) {
          console.warn("No active editor view available");
          return;
        }

        const selection = currentView.state.selection.main;
        const startLine = currentView.state.doc.lineAt(selection.from).number;
        const endLine = currentView.state.doc.lineAt(selection.to).number;
        const droppedText = currentView.state.sliceDoc(selection.from, selection.to).trim();

        if (!droppedText) {
          console.warn("Skipping empty snippet");
          return;
        }

        setTimeout(() => {
          const notebookWidget = notebookTracker?.currentWidget;
          const notebookPath = notebookWidget?.context?.path;
          const activeCellId = notebookWidget?.content?.activeCell?.model?.id;

          if (!notebookPath || !activeCellId) {
            console.error("Failed to capture notebook or cell ID.");
            return;
          }

          const cellId = getCellIdFromEditor(currentView!);
          if (!cellId) return;

          snippetsManager.update(cellId, currentView!);
          snippetsManager.create(
            currentView!,
            startLine,
            endLine,
            templateID,
            droppedText,
            notebookPath,
            cellId
          );
          snippetsManager.assignDecorations(currentView!, cellId);
        }, 10);

        const cursorPos = selection.to;
        currentView.dispatch({
          selection: { anchor: cursorPos },
          scrollIntoView: true
        });
      },
      false
    );
      }

  const viewPlugin = ViewPlugin.fromClass(
    class {
      /** The current set of decorations in the editor */
      decorations: DecorationSet;
      /** Store the view instance */
      view: EditorView;
      
      /**
       * Initializes the plugin for a specific editor view
       * 
       * @param view - The editor view this plugin instance is attached to
       * 
       * Sets up the initial decorations and event listeners for:
       * - Paste events: Handle pasting templates into the editor
       * - Drop events: Handle drag-and-drop of templates into the editor
       */
      constructor(view: EditorView) {
        // Store the view instance
        this.view = view;
        
        // Update the current view reference
        currentView = view;
        
        // Initialize decorations
        this.decorations = snippetsManager.assignDecorations(view);
        
        /**
         * Event listener for drop events
         * 
         * Handles when a template is dragged and dropped into the editor.
         * Parses the drop data and creates a new snippet instance if it contains
         * a valid template.
         */
        view.dom.addEventListener('drop', event => {
          event.preventDefault();
         
          const dragContent = event.dataTransfer?.getData('application/json');
          const droppedText = event.dataTransfer?.getData('text/plain');
  
          if (!dragContent) return;
          if (!droppedText) return;
          
          const parsedText = JSON.parse(dragContent);
  
          if(!(parsedText.marker === "aspen-template")) return; 
  
          const selection = view.state.selection.main;
          const dropPos = selection.from;
          const startLine = view.state.doc.lineAt(dropPos).number;
          const endLine = startLine + droppedText.split('\n').length - 1;
          const templateID = parsedText.templateID;
          

          setTimeout(() => {
            if (!notebookTracker?.currentWidget?.context?.path){
              console.error("Failed to capture the cell ID of the currently active cell.")
              return;
            }
            if (!notebookTracker?.currentWidget?.content.activeCell?.model.id){
              console.error("Failed to capture the cell ID of the currently active cell.")
              return;
            }

            const cellId = getCellIdFromEditor(view);
            if (!cellId){ return; }

            const notebookId : string = notebookTracker.currentWidget.context.path
            snippetsManager.update(cellId,currentView!);
            snippetsManager.create(currentView!, startLine, endLine, templateID, droppedText, notebookId, cellId);
            snippetsManager.assignDecorations(currentView!, cellId);

            // move cursor to end of inserted text, so that there is no selection
            const cursorPos = dropPos + droppedText.length;
            view.dispatch({
              selection: { anchor: cursorPos },
              scrollIntoView: true
            });
          }, 10); // A small delay to ensure updates are applied after the text is dropped
        });

        /**
         * Handles the refresh decorations for when the template is deleted 
         * and when the toggle button is clicked.
         */
        const handleEvent = (event: Event)=>{
        if(!view){
          console.warn("No active view");
          return;
        }
        view.dispatch({
          effects: []
          });
          };
        document.addEventListener('TemplateDeleted',handleEvent);
        document.addEventListener('Toggle Template Highlight',handleEvent);

      }
      
      /**
       * Cleanup when the view plugin is destroyed
       */
      destroy() {
        // Clear the currentView reference if it matches this view
        if (currentView === this.view) {
          currentView = null;
        }
      }

      /**
       * Updates the plugin state when changes occur in the editor
       * 
       * @param update - The ViewUpdate object containing information about the changes
       * 
       * This method is called whenever the document changes. It:
       * 1. Updates the positions of snippet instances via snippetsManager
       * 2. Refreshes the decorations to reflect the current state
       */
      update(update: ViewUpdate) {
        // Update the stored view instance
        this.view = update.view;
        // Update the current view reference
        currentView = update.view;
          //How does it know which view to add the decorations to
          //its that view with that cell id thats why 
        const cellId = getCellIdFromEditor(update.view);

        if (!cellId){ return; }
        if (update.docChanged || update.transactions.length > 0) {
          snippetsManager.update(cellId, update.view, update);
          this.decorations = snippetsManager.assignDecorations(update.view, cellId);
        }
      }
    },
    {
      // Provide the decorations from this plugin to CodeMirror
      decorations: v => v.decorations
    }
  );

  return [viewPlugin,customKeymap,keymap.of(defaultKeymap)];
}