/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable prettier/prettier */
import {ReactWidget} from "@jupyterlab/ui-components";
import * as React from "react";
import {useState} from "react";
import "../style/index.css";
import "../style/base.css";
import {copyIcon, editIcon, deleteIcon, caretDownIcon, caretRightIcon} from "@jupyterlab/ui-components";
import {ITemplate, ISnippet} from "./types";
import {TemplatesManager} from "./TemplatesManager";
import {SnippetsManager} from "./snippetManager";


function Library({
  templates,
  snippets,
  deleteTemplate,
  renameTemplate,
  editTemplate,
  toggleTemplateColor,
  activeTemplateHighlightIds,
  lastCreatedTemplateId
}: {
  templates: ITemplate[],
  snippets: ISnippet[],
  deleteTemplate: (id: string, name: string) => void,
  renameTemplate: (id: string, name: string) => void,
  editTemplate: (id: string, name: string) => void,
  toggleTemplateColor: (id: string) => void,
  activeTemplateHighlightIds: Set<string>,
  lastCreatedTemplateId?: string
}) {
  console.log("Library received templates:", templates);
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
      console.log("Copied to clipboard successfully!");
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
    const textarea = event.target;
    setNewContent(textarea.value);
    textarea.style.height = "auto";
  }

  const handleEditConfirm = (id: string) => {
    if (newContent.trim() !== "") {
      editTemplate(id, newContent.trim());
    }
    setEditingId(null); // exit editing mode
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
              
                {editingId === template.id ? (
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
                    {template.content}
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
  lastCreatedTemplateId?: string;

  constructor(templatesManager: TemplatesManager, snippetsManager: SnippetsManager) {
    super();
    this.addClass("jp-LibraryWidget");
    this.templateManager = templatesManager;
    this.snippetsManager = snippetsManager;
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
      await this.templateManager.edit(id, newContent);
      this.update();
    } catch ( error : unknown ){
      console.error("Failed to edit template - LibWidget call", error);
    }
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

  render() {
    return <Library
      templates={this.templateManager.getAll()}
      snippets={this.snippetsManager.snippetTracker}
      deleteTemplate={this.deleteTemplate}
      renameTemplate={this.renameTemplate}
      editTemplate={this.editTemplate}
      toggleTemplateColor={this.toggleTemplateColor}
      activeTemplateHighlightIds={this.templateManager.getActiveHighlights()}
      lastCreatedTemplateId={this.lastCreatedTemplateId}
    />;
  }
}