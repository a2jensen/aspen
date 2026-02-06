/* eslint-disable curly */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable prettier/prettier */
import { ITemplate, IContentsManager } from "./types";

/**
 * This class is responsible for managing templates within the application.
 * It handles creation, storage, retrieval, updating, and deletion of templates.
 * Templates are stored both in-memory as an array and persisted as JSON files.
 */
export class TemplatesManager {
  private templates: ITemplate[];
  private contentsManager: IContentsManager;
  private activeHighlights: Set<string> = new Set();

  constructor(contentManager: IContentsManager){
    this.templates = [];
    this.contentsManager = contentManager;
    this.activeHighlights = new Set();
  }

  getAll() : ITemplate[] {
    return this.templates;
  }

  get(templateId: string) : ITemplate | undefined {
    return this.templates.find(template => template.id === templateId);
  }

  getActiveHighlights() : Set<string> {
    return this.activeHighlights;
  }

  /**
   * Creates a new template from the provided code snippet
   * @param codeSnippet - The code content to be saved as a template
   */
  async create(codeSnippet: string) : Promise<ITemplate | void> {
    if (!codeSnippet.trim()){
      console.error("Empty or whitespace-only string")
      return;
    }

    const template: ITemplate = {
      id: `${Date.now()}`, 
      name: `Template ${this.templates.length + 1}`, 
      content: codeSnippet,
      dateCreated: new Date(),
      dateUpdated: new Date(),
      tags: [],
      color: this.assignColor()
    }
    this.templates.push(template);
    this.activeHighlights.add(template.id);

    try {
      await this.contentsManager.save(`/snippets/${template.name}.json`, {
        type: "file",
        format: "text",
        content: JSON.stringify(template,null,2)
      });
      console.log(`Saved ${template.name} to file successfully.`);
      return template;
    }
    catch (error) {
      console.error("Error saving file", error);
    }
  }

  /**
   * Deletes a template from both the in-memory array and filesystem
   * @param id - The unique identifier of the template to delete
   * @param name - The name of the template (used for file path construction)
   */
  async delete(templateId : string) : Promise<void> {
    if (!templateId.trim){
      console.error("Empty or whitespace-only string")
      return;
    }

    const template = this.get(templateId);
    if (!template){
      console.error(`Failed to get the requested template ${templateId} within delete`)
      return;
    };

    this.templates = this.templates.filter(template => template.id !== templateId);

    try {
      await this.contentsManager.delete(`/snippets/${template.name}.json`);
      document.dispatchEvent(new CustomEvent('TemplateDeleted', {
        detail: {templateID: templateId}
      }));
    } catch (error : unknown ) {
      console.error(`Failed to delete template ${template.name} ${templateId}`, error);
    }
  }

  /**
   * Renames a template and updates its file path
   * @param id - The unique identifier of the template to rename
   * @param newName - The new name to assign to the template
   */
  async rename(templateId: string, newName: string) : Promise<void> {
    if (!templateId.trim()) {
      console.error("Empty or whitespace-only string")
      return;
    }

    const template = this.get(templateId);
    if (!template){
      console.error(`Failed to get the requested template ${templateId} within rename`)
      return;
    };


    const oldName = template.name;
    const oldPath = `/snippets/${template.name}.json`;
    const newPath = `/snippets/${newName}.json`;

    template.name = newName;
    template.dateUpdated = new Date();

    try {
      await this.contentsManager.save(oldPath, {
        type: "file",
        format: "text",
        content: JSON.stringify(template, null, 2)
      });
      await this.contentsManager.rename(oldPath, newPath);
    } catch (error) {
      console.error(`Error renaming template file for ${oldName}`, error);
    }
  }

  /**
   * Updates the content of an existing template
   * @param id - The unique identifier of the template to edit
   * @param newContent - The new content to replace the existing template content
   */
  async edit(templateId: string, newContent: string) : Promise<void> {
    if (!templateId.trim()) {
      console.error("Empty or whitespace-only string")
      return;
    }

    const template = this.get(templateId);
    if (!template){
      console.error(`Failed to get the requested template ${templateId} within edit`)
      return;
    };


    template.content = newContent;
    template.dateUpdated = new Date();

    const filePath = `/snippets/${template.name}.json`;

    try {
      await this.contentsManager.save(filePath, {
        type : "file",
        format: "text",
        content: JSON.stringify(template, null, 2)
      })
    } catch (error : unknown ) {
      console.error("Error updating template content", error);
    };
  }
  
  /**
   * Generates a random color for the specific template and its
   * corresponding snippets
   */
  assignColor() : string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  /**
   * Turns the coloring for a template on or off.
   * When first created, it should be on.
   * If toggled off, it is deleted from the list.
   */
  toggleColor (id: string) : void {
    if (this.activeHighlights.has(id)) {
      this.activeHighlights.delete(id); 
    } else {
      this.activeHighlights.add(id);
    }  
    document.dispatchEvent(new CustomEvent("Toggle Template Highlight", {
      detail: {templateId: id}
    }));
  }

  getContent = (id: string, trim?: boolean): string => {
    const template = this.get(id);
    if(!template){
      return "";
    }
    let clean = template.content.replace(/{{\s*(.*?)\s*}}/g, '$1');

    if(trim){
      // only replace whitespaces of length 1-3 to avoid replacing tabs
      clean = clean.replace(/(?<! ) {1,3}(?! )/g, ' ');
    }
    return clean;
  }

  getTemplates(){
    return this.templates;
  }

  /**
   * Loads all templates from the filesystem into memory.
   */

  async loadTemplates() : Promise<void> {
    this.templates = [];

    try {
      const model = await this.contentsManager.get("/snippets");
      
      if (model.type === "directory") {
        for (const file of model.content) {
          try {
            const fileModel = await this.contentsManager.get(file.path);
            const templateData = JSON.parse(fileModel.content as string);

            const template: ITemplate = {
              id: templateData.id,  
              name: templateData.name || file.name,  
              content: templateData.content || "",   
              dateCreated: new Date(templateData.dateCreated || Date.now()),
              dateUpdated: new Date(templateData.dateUpdated || Date.now()),
              tags: templateData.tags || [],        
              color: templateData.color || "#ffffff"
            };

            this.templates.push(template);
          }
          catch (error) {
            console.error(`Error loading or parsing file: ${file.path}`, error);
          }
        }
      }
    }
    catch (error) {
      console.error("Error fetching snippets directory:", error);
    }
  }
}
