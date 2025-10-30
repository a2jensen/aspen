/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable prettier/prettier */
import {ReactWidget} from "@jupyterlab/ui-components";
import * as React from "react";
import {useState} from "react";
import { Message } from '@lumino/messaging';
import "../style/index.css";
import "../style/base.css";
import { copyIcon, editIcon, deleteIcon, caretDownIcon, caretRightIcon } from '@jupyterlab/ui-components';
import { ITemplate, ISnippet } from "./types";
import { TemplatesManager } from './TemplatesManager';
import { SnippetsManager } from './snippetManager';
import { TextboxesManager } from './TextboxesManager';
import { Synchronization } from "./Synchronization";

export type FormattedContent = {
  snippetId : string,
  templateContent : string,
}

/**
 * TODO: possibly move updates into the REACT component itself....
 * pass in templatesManager / snippetsManager into component...
 * useEffect for state updates
 * edge case : handle array updates outside of component, implement Signaling possibly
 */


function Library({
  templates,
  snippets,
  deleteTemplate,
  renameTemplate,
  editTemplate,
  textboxEdit,
  syncTemplate,
  toggleTemplateColor,
  activeTemplateHighlightIds,
  lastCreatedTemplateId
}: {
  templates: ITemplate[],
  snippets: ISnippet[],
  deleteTemplate: (id: string, name: string) => void,
  renameTemplate: (id: string, name: string) => void,
  editTemplate: (id: string, name: string) => void, // TODO: textboxesEdited needs to be edited to textboxedit type
  textboxEdit : (templateId : string, newContent : string) => FormattedContent[] | undefined,
  syncTemplate: (id: string, newContent : FormattedContent[]) => void,
  toggleTemplateColor: (id: string) => void,
  activeTemplateHighlightIds: Set<string>,
  lastCreatedTemplateId?: string
}) {
  // console.log("Library received templates:", templates);
  //const [expandedTemplates, setExpandedTemplates] = useState<{[key: string]: boolean}>({});
  const [expandedTemplates, setExpandedTemplates] = useState(() => {
    const initExpandedTemplates: {[templateId: string]: boolean} = {};
    templates.forEach(template => {
      initExpandedTemplates[template.id] = true;
    });
    return initExpandedTemplates;
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newContent, setNewContent] = useState<string>("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const toggleTemplate = (id: string) => {
    setExpandedTemplates((prev) => ({
      ...prev,
      [id]: !prev[id], // Toggle specific template's expanded state
    }));
  };

  // when a template is created, toggle it open
  React.useEffect(() => {
    if (lastCreatedTemplateId) {
      toggleTemplate(lastCreatedTemplateId);
    }
  }, [lastCreatedTemplateId]);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, template: ITemplate) => {
    //added a line before and after the content in order to be able to get out of template, issue still there tho if we delete it it wont work
    event.dataTransfer.setData("text/plain", template.content);
    event.dataTransfer.setData("application/json", JSON.stringify(template)); // Store full template info
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleCopy = (template: ITemplate) => {
    const jsonData = JSON.stringify(template);
    const parsedData = JSON.parse(jsonData);
    
    navigator.clipboard.writeText(parsedData.content).then(() => {
      localStorage.setItem("templateId", parsedData.id);
      //("Copied to clipboard successfully!");
    });
  }

  const handleRenameStart = (template: ITemplate) => {
    setRenamingId(template.id); // enter renaming mode
    setNewName(template.name); // current name is prefilled
  }

  const handleRenameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(event.target.value);
  }

  const handleRenameConfirm = (id: string) => {
    if (newName.trim() !== "") {
      renameTemplate(id, newName.trim());
    }
    setRenamingId(null); // exit renaming mode
  }

  // set cursor to end of template when editing
  React.useEffect(() => {
    if (editingId && textareaRef.current) {
      const textarea = textareaRef.current;
      const length = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(length, length);
    }
  }, [editingId]);

  const handleEditStart = (template: ITemplate) => {
    setEditingId(template.id); // enter editing mode
    setNewContent(template.content); // current content is prefilled
    if (!expandedTemplates[template.id]) { // toggle template open if collapsed
      toggleTemplate(template.id);
    }
    console.log("editing mode");
  }

  const handleEditChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    //console.log("Inside handleEdit change")
    const textarea = event.target;
    setNewContent(textarea.value);
    textarea.style.height = "auto";
  }

  const handleEditConfirm = (id: string) => {
    //console.log("finally confirming edit.... gdtting out of Edit Mode! ", newContent)
    if (newContent.trim() !== "") {
      editTemplate(id, newContent.trim()); // editing the template directly with the new content
      const newContentFormatted = textboxEdit(id, newContent.trim()); // editing the new content and reformatting it into a state that we can pass into sncTemplate()
      //editTemplate(id, newContent.trim()); // editing the template directly with the new content
      
      if (!newContentFormatted){
        console.log("RETURN of newContentFormatted is UNDEFINED")
        return;
      }
      //console.log("NEW CONTENT NON FORMATTED", newContent.trim())
      //console.log("NEW CONTENT FORMATTED FOR SYNC", newContentFormatted.trim())
      console.log("New content that we are sending to sync ", newContentFormatted)
      syncTemplate(id, newContentFormatted); // TODO: instead of passing in newContent, we pass in the newly formatted template content from textboxEdit()
      
    }
    setEditingId(null); // exit editing mode
    //console.log("New content captured: ", newContent)
  }

  // Function to parse template into plain text and textboxes
  // Enables react to render textboxes in library
  const parseTemplate = (content: string) => {
    const parts = content.split(/({{.*?}})/g);
    // console.log("parts ", parts);
    return parts.map(part => {
      if(part.startsWith('{{') && part.endsWith('}}')){
        return{
          type: 'textbox',
          value: part.slice(2, -2).trim()
        };
      }
      else{
        return{
          type: 'text',
          value: part
        }
      }
    });
  }

  // Function to render textboxes in templates
  const renderTextboxes = (content: string ) => {
    const parsed = parseTemplate(content);
    return parsed.map((t, i) => {
      if(t.type === 'text'){
        return <span key={`text-${i}`}>{t.value}</span>
      }
      else{
        return (
          <input
            key={`input-${t.value}--${i}`}
            value={t.value}
            style={{
               backgroundColor: '#e3e3e3ff',
              border: '2px solid #949494ff',
              borderRadius: '4px',
              padding: '1px 4px',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              width: `${Math.max(t.value.length, 1)}ch`,
              margin: '0 2px',
            }}
          />
        );
      }
    });
  }

  return (
    <div className="library-container">
      <h3 className="library-title">Your Templates</h3>

      {templates.length > 0 ? (
        templates.map((template) => (
          <div className="template-item" key={template.id}>
            {/** Section corresponding to when the template is not opened */}
            <div className="template-header">
              <button className="template-toggle" onClick={() => toggleTemplate(template.id)}>
                {expandedTemplates[template.id] ? <caretDownIcon.react tag="span" height="16px" width="16px"/>: <caretRightIcon.react tag="span" height="16px" width="16px"/>}
              </button>
              
              {renamingId === template.id ? (
                <input
                className="rename-input"
                type="text"
                value={newName}
                onChange={handleRenameChange}
                onBlur={() => handleRenameConfirm(template.id)} // when user clicks outside, confirms rename
                onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm(template.id)} // when user presses enter, confirms rename
                autoFocus // user can type in field without clicking first
                />
              ): (
              <span className="template-name" onClick={() => handleRenameStart(template)}>
                {template.name}
              </span>
              )}

              <div className="template-buttons">
                <button 
                  className={`template-toggle-highlight ${activeTemplateHighlightIds.has(template.id) ? "template-highlight-active" : ""}`}
                  title={activeTemplateHighlightIds.has(template.id) ? "Hide highlights" : "Show highlights"} 
                  onClick={() => {
                    toggleTemplateColor(template.id);
                  }}
                >
                  <span style={{
                    color: activeTemplateHighlightIds.has(template.id) ? template.color : "gray"
                  }}>▣</span>
                </button>

                <button className="template-copy" title="Copy to clipboard" onClick={() => handleCopy(template)}>
                  <copyIcon.react tag="span" height="16px" width="16px"/>
                </button>
                <button className="template-edit" title="Edit template" onClick={() => handleEditStart(template)}>
                  <editIcon.react tag="span" height="16px" width="16px"/>
                </button>
                <button className="template-delete" title="Delete template" onClick={() => deleteTemplate(template.id, template.name)}>
                  <deleteIcon.react tag="span" height="16px" width="16px"/>
                </button>
              </div>
            </div>
            
            {/** Section corresponding to when the template is opened */}
            {expandedTemplates[template.id] && (
              <div className="template-content"
                // cannot drag and drop the template currently being edited
                draggable={editingId !== template.id}
                onDragStart={(event) => {
                    if (editingId !== template.id) {
                      handleDragStart(event, template);
                    }
                  }}
              >
              
                {editingId === template.id ?  (
                  <textarea
                    ref={textareaRef}
                    className="edit-content-textarea"
                    value={newContent}
                    onChange={handleEditChange}
                    onBlur={() => handleEditConfirm(template.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEditConfirm(template.id);
                      } else if (e.key === "Tab") {
                        e.preventDefault();
                        const start = e.currentTarget.selectionStart;
                        const end = e.currentTarget.selectionEnd;
                        setNewContent(
                          newContent.substring(0, start) + "  " + newContent.substring(end) // Inserts 2 spaces
                        );
                        setTimeout(() => {
                          e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2; // Move cursor
                        }, 0);
                      }
                    }}
                    autoFocus
                  />
                ): (
                  <p className="template-snippet" 
                    onClick={() => handleEditStart(template)}
                    data-template-id={template.id}  
                    draggable 
                    onDragStart={(event) => handleDragStart(event, template)}
                  >
                    {renderTextboxes(template.content)}
                  </p>
                )}
              </div>
            )}
          </div>
        ))
      ): (
        <p>No templates available</p>
      )}
    </div>
  );
}

/**
 * LibraryWidget extends ReactWidget, which in turn extends Widget.
 * This class manages the template connection as well as renders the Library react component
 */

export class LibraryWidget extends ReactWidget {
  templateManager: TemplatesManager;
  snippetsManager: SnippetsManager;
  textboxesManager : TextboxesManager;
  synchronizeManager? : Synchronization;
  lastCreatedTemplateId?: string;

  constructor(templatesManager: TemplatesManager, snippetsManager: SnippetsManager, textboxesManager: TextboxesManager ) {
    super();
    this.addClass("jp-LibraryWidget");
    this.templateManager = templatesManager;
    this.snippetsManager = snippetsManager;
    this.textboxesManager = textboxesManager;
  }
  
  handleUpdateLibrary = (event: CustomEvent) => {
    requestAnimationFrame(() => {
      this.update();
    })
  };
  
  onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    document.addEventListener('updateLibrary', this.handleUpdateLibrary as EventListener);
  }

  onBeforeDetach(msg: Message): void {
    super.onBeforeDetach(msg);
    document.removeEventListener('updateLibrary', this.handleUpdateLibrary as EventListener);
  }

  async createTemplate(codeSnippet: string) : Promise<ITemplate | void> {
    try {
      const template = await this.templateManager.create(codeSnippet);
      if (template) {
        this.lastCreatedTemplateId = template.id;
      }
      this.update();
      return template;
    } catch ( error : unknown ){
      console.error(`Failed to create template`, error)
      this.update();
    }
  }

  // Adding async/await to this function causes a delay in the instance being deleted from the UI.
  deleteTemplate = (id: string) : void => {
    try {
      this.templateManager.delete(id);
      this.update();
    } catch (error: unknown) {
      console.error("Failed to delete templates - LibWidget call", error);
    }
  }
  

  renameTemplate = async (id: string, newName: string) : Promise<void> => {
    try{
      await this.templateManager.rename(id, newName);
      this.update();
    } catch (error : unknown ) {
      console.error("Failed to rename template - LibWidget call", error);
    }
  }

editTemplate = async (id: string, newContent: string) : Promise<void> => {
    try {
        const template = this.templateManager.get(id);
        this.templateManager.edit(id, newContent);
        
        // find all placeholders ({{}}) by line
        const lines = newContent.split("\n");
        let matches: {
          line: number,
          start: number,
          end: number,
          content: string
        }[] = [];

        lines.forEach((str, line) => {
          const regex = /{{\s*(.*?)\s*}}/g;
          let match: RegExpExecArray | null;
          while((match = regex.exec(str)) !== null){
            matches.push({
              line: line,
              start: match.index,
              end: match.index + match[1].length,
              content: match[1].trim(),
            });
          }});

        // filter through textbox tracker to find all textboxes in the template
        const textboxes = template!.textboxes.filter(t => !t.snippetId);
        if(textboxes.length != matches.length){
          console.warn("The number of textboxes in the template doesn't match the tracker");
          return;
        }

        // sort so that the matches and textboxes are in the correct order (by position)
        textboxes.sort((a, b) => a.from - b.from);
        matches.sort((a, b) => a.start - b.start);

        for(let i = 0; i < matches.length; i++){
          const match = matches[i];
          const textbox = textboxes[i];

      // if the content is different from the old textbox value -> update
      if(textbox && textbox.content !== match.content){
          // const old = textbox.content;
          textbox.from = match.start;
          textbox.to = match.end;
          textbox.content = match.content; 
      }
    }
    this.update();

    } catch ( error : unknown ){
      console.error("Failed to edit template - LibWidget call", error);
    }
  }

  textboxEdited = (templateId : string, newContent : string) : FormattedContent[] | undefined  => {
    const formattedTemplateContent : FormattedContent[] = []
    const template = this.templateManager.get(templateId);
    if (!template){
      console.error("Failed to fetch template");
      return;
    }

    const editedTextboxes: { newTextboxContent: string; sharedId: number }[] = [];
    const regex = /{{\s*(.*?)\s*}}/g;
    const oldTemplateContent = template.content.split("\n");
    const oldTemplateTextboxes = template.textboxes


    //console.log("CURRENT TEXTBOXES ", oldTemplateTextboxes)
    
    // iterate through old template content and populate textbox content
    const oldTextboxContent : {innerContent: string, startIndex : number, line : number, sharedId : number}[] = []
    oldTemplateContent.forEach((line, index) => {
      const textboxesContent = [...line.matchAll(regex)]
      //console.log("textboxes found in the old template,  ", textboxesContent);

      // iterate through the textboxes found
      for (const textbox of textboxesContent) {
        const innerContent = textbox[1];
        const startIndex = textbox.index

        if (startIndex == undefined){
          console.log("Start index is undefined - case should never be reached");
          break;
        }

        // find the matching textbox
        const currentLineTextboxes = oldTemplateTextboxes.filter(template => template.line === index)
        const matchingTextbox = currentLineTextboxes.find(textbox => textbox.from == startIndex && textbox.templateId == templateId && !textbox.snippetId );
        if (!matchingTextbox) {
          console.log("No textboxes were found in the matching case!")
          return {
            edited : false,
            textboxesEdited : [],
          }
        }

        oldTextboxContent.push({
          innerContent, startIndex, line : index, sharedId: matchingTextbox.sharedId
        })
      }
    })

    // iterate through the new template content and edit all the textboxes to match the snippet instance
    const snippets = this.snippetsManager.getSnippets(templateId);
    
    for (const snippet of snippets) {
      const newTemplateContent = newContent.split("\n");
      newTemplateContent.forEach((line, index) => {
        const textboxesContent = [...line.matchAll(regex)];
        const filteredOldTextboxes = oldTextboxContent.filter(info => info.line == index).sort((a,b) => a.startIndex - b.startIndex )
        
        for (let i = 0; i < textboxesContent.length; i++){
          let innerContent = textboxesContent[i][1];
          const correspondingTemplateTextbox = template.textboxes
          .find(textbox => !textbox.snippetId && textbox.line == index && textbox.sharedId == filteredOldTextboxes[i].sharedId)
          const correspondingSnippetTextbox = template.textboxes
          .find(textbox => textbox.snippetId == snippet.id && textbox.line == index && textbox.sharedId == correspondingTemplateTextbox?.sharedId)
                
          if (!correspondingSnippetTextbox){
            console.log("could not find the corresponding snippet textbox");
            continue;
          }

          console.log("CORRESPONDING SNIPPET TEXTBOX" , correspondingSnippetTextbox)
          console.log(`This textbox was edited! , ${innerContent} + ${filteredOldTextboxes[i].innerContent}`);
          editedTextboxes.push({
            newTextboxContent : innerContent,
            sharedId : filteredOldTextboxes[i].sharedId
          });
           
          // MASS UPDATE CASE!
          
          /** 
          newTemplateContent[index] = newTemplateContent[index].replace("{{" + innerContent + "}}", innerContent)
          this.snippetsManager.removeTextboxDeco(correspondingSnippetTextbox.id , snippet)
          if (correspondingTemplateTextbox){
            console.log("REMOVING TEXTBOX FROM TEMPLATE NOW!")
            this.templateManager.removeTextboxDeco(correspondingTemplateTextbox.templateId, correspondingTemplateTextbox.id , correspondingTemplateTextbox.line , innerContent)
            this.update()
          } */

          // DEFAULT PARAMETERS CASE!
          newTemplateContent[index] = newTemplateContent[index].replace("{{" + innerContent + "}}", correspondingSnippetTextbox.content)
        }
      })
      formattedTemplateContent.push({snippetId : snippet.id , templateContent : newTemplateContent.join("\n")});
    }

    console.log("FORMATTED TEMPLATE CONTENT ", formattedTemplateContent)
    return formattedTemplateContent;
    }

  async loadTemplates() : Promise<void> {
    try {
      await this.templateManager.loadTemplates();
      this.update();
    } catch ( error : unknown ) {
      console.error("Failed to load templates - LibWidget")
    }
  }

  toggleTemplateColor = (id: string) : void => {
    this.templateManager.toggleColor(id);
    this.update();
  }

  syncTemplate =  (id : string, newContent : FormattedContent[] ) : void => {
    if (!this.synchronizeManager){
      console.error("Synchronization manager is undefined");
      return;
    }
    this.synchronizeManager.syncSnippets(id, newContent)
  }

  // created a setter function since there was a deadlock in init in index
  setSynchronization ( synchronization : Synchronization) {
    this.synchronizeManager = synchronization
  }
  

  render() {
    return <Library
      templates={this.templateManager.getAll()}
      snippets={this.snippetsManager.snippetTracker}
      deleteTemplate={this.deleteTemplate}
      renameTemplate={this.renameTemplate}
      editTemplate={this.editTemplate}
      textboxEdit={this.textboxEdited}
      syncTemplate={this.syncTemplate}
      toggleTemplateColor={this.toggleTemplateColor}
      activeTemplateHighlightIds={this.templateManager.getActiveHighlights()}
      lastCreatedTemplateId={this.lastCreatedTemplateId}
    />;
  }
}
