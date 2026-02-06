/* eslint-disable prefer-const */
/* eslint-disable curly */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable prettier/prettier */
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { ContentsManager } from "@jupyterlab/services";
import { TemplatesManager } from './TemplatesManager';
import { DiffRegion, ISnippet } from './types';
import { FormattedContent } from './LibraryWidget';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewUpdate
} from '@codemirror/view';
import { getTriggeredByCtrlEnter, setTriggeredByCtrlEnter } from './customkeyBinds';



/**
 * SnippetsManager Class
 * 
 * Responsible for managing snippet instances within the editor.
 * This class handles the creation, tracking, updating, and visualization of snippets.
 * It maintains the connection between snippet/template instances in the editor and their templates.
 */

// Defining StateEffect and StateField for textbox updates
export const updateTextboxEffect = StateEffect.define<DecorationSet>();
export const textboxStateField = StateField.define<DecorationSet>({
      create(){
        return Decoration.none;
      },
      update(deco, tr){
        for(let effect of tr.effects){
          if(effect.is(updateTextboxEffect)){
            return effect.value;
          }
        }
        return deco;
      },
      provide: f => EditorView.decorations.from(f)
    });

export class SnippetsManager {
  public snippetTracker: ISnippet[]; /** Array to keep track of all active snippets */
  public cellMap: Map<string,EditorView>; /** Map to associate editor views with their unique cell IDs */
  private templatesManager : TemplatesManager;
  private snippetDecorations: Map<string, DecorationSet>; /** Map of snippetId → decorations for diff highlights */

  /**
   * Initializes a new instance of the SnippetsManager
   */
  constructor( contentsManager : ContentsManager, templates : TemplatesManager){
    this.snippetTracker = [];
    this.cellMap = new Map();
    this.templatesManager = templates;
    this.snippetDecorations = new Map<string, DecorationSet>();
    

    //this.contentsManager = contentsManager;
    /**Purpose: If the template is deleted it will call deleteSnippets */
    document.addEventListener('TemplateDeleted', (event: Event) => {
      const customEvent = event as CustomEvent;
      const templateID = customEvent.detail.templateID;
      const snippetsToRemove = this.getSnippets(templateID);
      this.deleteSnippetsByTemplate(templateID);
      
      for(const snippet of snippetsToRemove){
        this.clearSnippetHighlights(snippet.id);
      }
    });
  }

  /**
   * Assigns a unique cell ID to an editor view
   * 
   * @param view - The editor view to assign an ID to
   * @returns The assigned cell ID
   * 
   * If the view already has an ID, returns the existing ID.
   * Otherwise, increments the counter and assigns a new ID.
   */
  assignCellID( cell_id : string, view : EditorView) {
    if(!this.cellMap.has(cell_id)) {
      this.cellMap.set(cell_id, view);
    }
    return cell_id;
  }


  /**
   * Creates a new snippet instance in the editor
   * 
   * @param view - The editor view where the snippet is being created
   * @param startLine - The starting line number of the snippet
   * @param endLine - The ending line number of the snippet
   * @param templateID - The ID of the template this snippet is based on
   * @param content - The code content of the snippet
   * 
   * Method is called when a template is dropped or pasted into the editor.
   * It creates a new Snippet object and adds it to the snippetTracker.
   */

  create(view: EditorView, startLine: number, endLine: number, templateID: string, content: string, notebookId : string, cellIndex : string){
    const cellID = this.assignCellID(cellIndex,view);
    const snippet = {
      id: `${Date.now()}`,
      notebook_id : notebookId,
      cell_id: cellID ?? "", 
      content: content,
      start_line: startLine,
      end_line: endLine,
      template_id: templateID
    }
    this.snippetTracker.push(snippet);
    return snippet;
  }

  /**
   * Deletes all snippets associated with a specific template ID
   * 
   * @param templateID - The ID of the template whose snippets should be deleted
   * 
   * This method filters the snippetTracker to remove all snippets that match the given template ID.
   */

  deleteSnippetsByTemplate(templateID: string) {
    this.snippetTracker = this.snippetTracker.filter(snippet => {
      const keep = snippet.template_id !== templateID;
      if (!keep) {
        console.log(`Removed snippet for template ID: ${templateID}`);
      }
      return keep;
    });
    // console.log(`Snippets remaining after delete:`, this.snippetTracker);
  }

  /**
   * Updates all snippet line positions after editor changes
   * 
   * @param view - The editor view being updated
   * @param update - The ViewUpdate object containing information about the changes
   * 
   * This method adjusts the start and end line numbers of snippets when:
   * - Text is inserted or deleted before a snippet (shifts the snippet)
   * - Text is inserted or deleted within a snippet (expands or contracts the snippet)
   * 
   * Known issues:
   * - Relies on template start and end positions which may not be accurate
   * - Requires cell ID to update the correct line numbers when multiple cells exist
   */
  update(cell_id: string, view: EditorView, update?: ViewUpdate) {
      if (!update) return;
  
      const oldDoc = update.startState.doc; //this is the previous editor state
      const newDoc = update.state.doc;     
      const newTotalLines = newDoc.lines; 
      //from A and to A are the new things that were added, so we checking it with old doc to see what was inserted and what was not
      update.changes.iterChanges((fromA, toA, fromB, toB, insertedText) => {
        const insertedLines = insertedText.toString().split("\n").length - 1; //how many new line inerted
        const removedLines = oldDoc.lineAt(toA).number - oldDoc.lineAt(fromA).number; //how many lines removed
    
        for (const snippet of this.snippetTracker) {
          let { start_line, end_line } = snippet;
          if (snippet.cell_id !== cell_id) continue; 

          //  Text inserted above 
          if (fromA < oldDoc.line(start_line).from) {
            start_line += insertedLines - removedLines;
            end_line += insertedLines - removedLines;
          }
          else if (fromA >= oldDoc.line(start_line).from && toA <= oldDoc.line(end_line).to) {
                const atStart = (fromA === oldDoc.line(start_line).from);
                const AtEnd = (toA === oldDoc.line(end_line).to);
            //must be at the very start or very end and have clicked the keybind in order to exit snippet
                if(AtEnd && getTriggeredByCtrlEnter()){
                  setTriggeredByCtrlEnter(false);
                  continue;
                }
                else if(atStart && getTriggeredByCtrlEnter()){
                  setTriggeredByCtrlEnter(false);
                  start_line += 1;
                }
            end_line += insertedLines - removedLines;
          }
    
          //Prevent out-of-bounds issues
          start_line = Math.max(1, Math.min(start_line, newTotalLines));
          end_line = Math.max(start_line, Math.min(end_line, newTotalLines));
    
          snippet.start_line = start_line;
          snippet.end_line = end_line;

          const startPos = newDoc.line(start_line).from;
          const endPos = newDoc.line(end_line).to;
          const updatedSnippet = newDoc.sliceString(startPos, endPos);
          snippet.content = updatedSnippet;
        }
      });
    }

  unsync( snippetId: string) : void {
    const snippet = this.snippetTracker.find(s => s.id === snippetId);

    if (!snippet){
      console.warn("Snippet to unsync is not found in the snippet tracker array");
      return;
    }

    this.snippetTracker = this.snippetTracker.filter(s => s.id !== snippetId);
    this.clearSnippetHighlights(snippetId);
  }

  getView(id: string) : EditorView | undefined{
    for(const [cellId, view] of this.cellMap.entries()){
      if(cellId === id){
        return view;
      }
    }
  }

/**
 * Creates decorations to visually highlight snippets in the editor
 * 
 * @param view - The editor view to apply decorations to
 * @returns A DecorationSet containing all the visual decorations for snippets

* This method creates border decorations around snippets to visually distinguish them
* in the editor. It applies borders to the start and end lines of each snippet.
* 
* Potential enhancements:
* - Implement different color schemes for dark and light editor modes
* 
 */
  assignDecorations(view: EditorView, cell_id?: string): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    const snippetsInCell = this.snippetTracker
    .filter(s => s.cell_id === cell_id)
    .filter(s => this.templatesManager.getActiveHighlights().has(s.template_id))
    .sort((a, b) => a.start_line - b.start_line);
    //goes through the snippetTracker and checks startline/endline for each
    for (const snippet of snippetsInCell) {
      const startLine = view.state.doc.line(snippet.start_line);
      const endLine = view.state.doc.line(snippet.end_line);
      
      const template = this.templatesManager.get(snippet.template_id);
      const borderColor = template ? template.color : undefined;

      builder.add(startLine.from, startLine.from, Decoration.line({
          attributes: { 
            style: `border-top: 2px solid ${borderColor}; border-left: 2px solid ${borderColor}; border-right: 2px solid ${borderColor};`,
            class: 
            'snippet-start-line',
            'data-cell-id': snippet.cell_id.toString(),
            'data-start-line': snippet.start_line.toString(),
            'data-end-line': snippet.end_line.toString(),
            'data-associated-template': snippet.template_id.toString(),
            'data-snippet-id' : snippet.id.toString()
          },
        })
      );
    
      builder.add(endLine.from, endLine.from, Decoration.line({
          attributes: { 
            style: `border-bottom: 2px solid ${borderColor}; border-left: 2px solid ${borderColor}; border-right: 2px solid ${borderColor};`,
            class: 
            'snippet-end-line',
            'data-snippet-id': snippet.cell_id.toString() // Store snippet ID as data attribute
          },
        })
      );
    }
    
    return builder.finish();
  }

  /**
   * Loads snippets from persistent storage
   * 
   * This method is intended to restore snippets when the editor is reopened.
   * 
   * TODO: Implement this method to load saved snippets 
   */
  load() {
    // TODO: Implementation needed
  }

  // Arrow functions automatically bind this to the instance where they were defined.
  editAll = ( templateId : string , templateContent : FormattedContent[], pushFromTemplate : boolean ) => {
    console.log("WITHIN EDIT ALL")
    // use the cell id and start / end lines to apply changes in the DOM.
    // returns array of snippets
    let snippets : ISnippet[] = this.snippetTracker.filter(snippet => snippet.template_id === templateId) // ERROR HERE
      console.log("CellMap",this.cellMap);

    for (const snippet of snippets){
      if (!snippet) {
        console.log(`Failed to find snippet with ID ${templateId}.`)
        return
      }
      const correspondingTemplateContent = templateContent.find(template => template.snippetId === snippet.id)
      if (!correspondingTemplateContent){
        console.log("Could not find the needed template content - in editAll")
        return;
      }
  
      // find the editor view ID for the cell
      //i can get the snippets and the view maybe i get it from snych?? but i need all different views
      //because i need to update it 
      //i need to save the correct view as well that is corresponding to that cellid - possibility try and save the editor view
      //I am accessiing the cell id so therefore the view should be there and should propagate if its the same thing?
      let targetView : EditorView | undefined;
      for (const [cellId, view] of this.cellMap.entries()) {
        if (cellId === snippet.cell_id) {
          targetView = view;
          console.log("Target View + CellId",targetView, cellId);
          break;
        }
      }
      
  
      if (!targetView) {
        console.log(`Editor view for cell ID ${snippet} not found`)
        return;
      }
      
      const doc = targetView.state.doc;
      const startPos = doc.line(snippet.start_line).from;
      const endPos = doc.line(snippet.end_line).to;
  
      // create transaction to replace the content
      targetView.dispatch({
        changes : {
          from : startPos,
          to: endPos,
          insert : correspondingTemplateContent.templateContent
        }
      })
  
      snippet.content = correspondingTemplateContent.templateContent
      console.log(`Updated snippet ${templateId} with the new template content - HERE IT IS ${snippet.content}!`)
    }
  }

  private hexToRgba(hex: string): string {
    hex = hex.replace(/^#/, '');

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, 0.4`;
  }

  /**
   * Helper method to get all snippets of a particular template.
   * @param templateId - The ID of the template to get the snippets of. 
   * @returns Array of the template's snippets
   */

  getSnippets(templateId: string) : ISnippet[]{
    let snippets = [];
    for(const snippet of this.snippetTracker){
      const id = snippet.template_id;
      if(id === templateId){
        snippets.push(snippet);
      }
    }
    return snippets;
  }

  // ============================================================
  // Phase 3: New Diff-Based Highlight Methods
  // ============================================================

  /**
   * Applies highlight decorations to a snippet based on diff regions.
   * This is the new simplified approach that takes DiffRegion[] directly.
   *
   * @param snippet - The snippet to apply highlights to
   * @param diffs - Array of DiffRegion from computeDiffs()
   * @param color - The template color (hex) for highlighting
   */
  applyDiffHighlights(snippet: ISnippet, diffs: DiffRegion[], color: string): void {
    const targetView = this.getView(snippet.cell_id);
    if (!targetView) {
      console.warn(`Editor view not found for snippet ${snippet.id}`);
      return;
    }

    // Defer to next frame to avoid "dispatch during update" error
    requestAnimationFrame(() => {
      const doc = targetView.state.doc;
      const builder = new RangeSetBuilder<Decoration>();
      const bgColor = this.hexToRgba(color);

      // Build decorations for each diff region where snippet has content
      for (const region of diffs) {
        // Skip zero-width ranges (deletions show nothing on snippet side)
        if (region.snippetFrom === region.snippetTo) {
          continue;
        }

        // Calculate absolute position in the document
        const absoluteLine = snippet.start_line + region.line;

        // Bounds check
        if (absoluteLine < 1 || absoluteLine > doc.lines) {
          console.warn(`Line ${absoluteLine} out of bounds for snippet ${snippet.id}`);
          continue;
        }

        const lineInfo = doc.line(absoluteLine);
        const from = lineInfo.from + region.snippetFrom;
        const to = lineInfo.from + region.snippetTo;

        // Clamp to line bounds
        const clampedFrom = Math.max(lineInfo.from, Math.min(from, lineInfo.to));
        const clampedTo = Math.max(clampedFrom, Math.min(to, lineInfo.to));

        if (clampedFrom < clampedTo) {
          builder.add(
            clampedFrom,
            clampedTo,
            Decoration.mark({
              attributes: {
                style: `background-color: ${bgColor}`,
                class: 'diff-highlight'
              },
              snippetId: snippet.id
            })
          );
        }
      }

      const newDecorations = builder.finish();

      // Store in our tracking map
      this.snippetDecorations.set(snippet.id, newDecorations);

      // Dispatch to the editor
      targetView.dispatch({
        effects: updateTextboxEffect.of(newDecorations)
      });
    });
  }

  /**
   * Clears all diff highlight decorations for a specific snippet.
   *
   * @param snippetId - The ID of the snippet to clear highlights from
   */
  clearSnippetHighlights(snippetId: string): void {
    const snippet = this.snippetTracker.find(s => s.id === snippetId);
    if (!snippet) {
      return;
    }

    const targetView = this.getView(snippet.cell_id);
    if (!targetView) {
      return;
    }

    // Remove from tracking
    this.snippetDecorations.delete(snippetId);

    // Defer to next frame to avoid "dispatch during update" error
    requestAnimationFrame(() => {
      targetView.dispatch({
        effects: updateTextboxEffect.of(Decoration.none)
      });
    });
  }

  /**
   * Gets the current diff decorations for a snippet.
   *
   * @param snippetId - The ID of the snippet
   * @returns The DecorationSet or undefined if none exist
   */
  getSnippetDecorations(snippetId: string): DecorationSet | undefined {
    return this.snippetDecorations.get(snippetId);
  }
}
