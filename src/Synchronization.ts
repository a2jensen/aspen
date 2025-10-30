/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable prettier/prettier */
import { TemplatesManager } from "./TemplatesManager";
import { SnippetsManager } from "./snippetManager";
import { LibraryWidget, FormattedContent } from "./LibraryWidget";

export class Synchronization {
    private templatesManager : TemplatesManager
    private snippetsManager : SnippetsManager
    private libraryWidget : LibraryWidget
    private syncFlag : boolean

    constructor (templatesManagerInstance : TemplatesManager, snippetsManagerInstance : SnippetsManager, libraryWidgetInstance : LibraryWidget){
        this.templatesManager = templatesManagerInstance;
        this.snippetsManager = snippetsManagerInstance;
        this.libraryWidget = libraryWidgetInstance;
        this.syncFlag = false;
    }

    /**
     * 2 cases to consider: user makes changes to template and synchs, user makes changes to instance and synchs
     * when we push from the template, we set cases to false since template already is edited
     */
    sync( templateId : string, content : string, pushFromInstance : boolean ) : void {
        this.syncFlag = true;
        try {
            if (pushFromInstance){
                this.templatesManager.edit(templateId, content)
            }
            // detect if a textbox was edited, 
            //this.snippetsManager.editAll(templateId, content, false)
            this.libraryWidget.update()
        } catch ( error : unknown ){
            console.error("Error trying to sync: ", error)
            return
        } finally {
            this.syncFlag = false;
        }
    }

    // temporary? function to handle global edits case
    syncSnippets(templateId : string, content : FormattedContent[]) : void {
        this.syncFlag = true;
        try {
            this.snippetsManager.editAll(templateId, content, true)
        } catch ( error : unknown ){
            console.error("Error trying to sync", error)
        } finally {
            this.syncFlag = false;
        }
    }

    syncAction() : boolean {
        return this.syncFlag;
    }
}