import { Contents } from "@jupyterlab/services"

/**
 * @type id : string -  ID associated with the template, generated through`${DateNow()}`
 * @type name : string - Name associated with the template
 * @type content : string - Content/string associated with the template
 * @type : dateCreated : Date - Tracks date creation of template
 * @type : dateUpdated : Date - Tracks most recent updates for the template
 * @type : tags : string[]  - Associates tags with templates - not implemented as of 3/5/25
 * @type color : string  - Color associated with the template - not implemented as of 3/5/25
 * @type : connections : string[] - Tracks associated snippet instances - not implemented as of 3/5/25 and may need refactoring
 * @type : textboxes : ITextbox[] - Tracks all textboxes in the template + textboxes in snippet instances
 */
export interface ITemplate {
  id: string;
  name: string;
  content: string;
  dateCreated: Date;
  dateUpdated: Date;
  tags: string[];
  color: string;
  textboxes: ITextbox[];
}

/**
* @type cell_id : number -  Unique identifier for the cell/view containing this snippet
* @type content : string - Content/string associated with the snippet
* @type start_line : number - starting line number in view/editor
* @type end_line : number - ending line number in view/editor
* @type template_id : string - reference to associated templateID
*/
export interface ISnippet {
  id: string;
  notebook_id : string;
  cell_id: string;
  content : string;
  start_line: number;
  end_line: number;
  template_id: string;
  }

/**
* @type id: number - Date created, unique identifier for the textbox
* @type content : string - Content in textbox
* @type line : number - Line number (relative to snippet)
* @type from : number - Starting character position of textbox (relative to line)
* @type to : number - Ending character position of textbox (relative to line)
* @type templateId : string - Reference to associated templateID
* @type snippetId : string - Reference to associated snippetID (if part of a snippet)
*/

export interface ITextbox{
  id: number;
  content: string;
  line: number;
  from: number;
  to: number;
  templateId: string;
  snippetId?: string;
  sharedId: number 
}

/**
 * Represents a single diff region between template and snippet content.
 * Used by the highlight system to track where divergence exists.
 *
 * @type line - 0-indexed line number (relative to snippet/template start)
 * @type templateFrom - char offset where diff starts in template line
 * @type templateTo - char offset where diff ends in template line
 * @type templateContent - the text in the template at this range (empty if insertion)
 * @type snippetFrom - char offset where diff starts in snippet line
 * @type snippetTo - char offset where diff ends in snippet line
 * @type snippetContent - the text in the snippet at this range (empty if deletion)
 */
export interface DiffRegion {
  line: number;
  templateFrom: number;
  templateTo: number;
  templateContent: string;
  snippetFrom: number;
  snippetTo: number;
  snippetContent: string;
}

/**
 * Represents a {{}} placeholder position in template content.
 * Used for parsing and updating template markers.
 *
 * @type line - 0-indexed line number
 * @type from - char offset of {{ in the line
 * @type to - char offset after }} in the line
 * @type content - the inner content between {{ and }}
 */
export interface PlaceholderPosition {
  line: number;
  from: number;
  to: number;
  content: string;
}

// exposing the only needed methods from the ContentsManager API.
export interface IContentsManager {
  save(path: string, options?: (Partial<Contents.IModel> & Partial<Contents.IContentProvisionOptions>)) : Promise<Contents.IModel>
  delete(path : string) : Promise<void>
  get(path: string, options?: Contents.IFetchOptions | undefined): Promise<Contents.IModel>
  rename(path: string, newPath: string): Promise<Contents.IModel>
}