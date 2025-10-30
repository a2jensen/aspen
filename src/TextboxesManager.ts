import { diffWords } from 'diff';
import { TemplatesManager } from './TemplatesManager';
import { SnippetsManager } from './snippetManager';
import { ISnippet, ITextbox, ITemplate } from './types';
import { EditorView, ViewUpdate }from '@codemirror/view';
import { LibraryWidget } from './LibraryWidget';

/**
 * Class responsible for creating, managing, tracking, and updating textboxes.
 * Maintains connections between textboxes in templates (library view) and textboxes in snippets (editor).
 */

export class TextboxesManager {
    private templatesManager : TemplatesManager
    private snippetsManager : SnippetsManager
    private libraryWidget : LibraryWidget | undefined;
    private textboxCounter = 0;
    private ignoreUpdate: Set<number>;
    private ignoreDiff: Set<string>;

    constructor (templates: TemplatesManager, snippets: SnippetsManager ){
        this.templatesManager = templates;
        this.snippetsManager = snippets;
        this.ignoreUpdate = new Set<number>();
        this,this.ignoreDiff = new Set<string>();
    }

    setLibraryWidget( library : LibraryWidget){
        this.libraryWidget = library;
    }

    /**
     * Function to generate textbox IDs.
     * @returns a numerical ITextbox ID.
     */

    private generateTextboxId = (): number => {
        const id = Date.now() + (this.textboxCounter++);
        return id;
    }

    /**
     * Function to generate a shared ID between textboxes across snippets and the template.
     * 
     * @returns a numerical shared ID.
     */

    private generateSharedId (): number {
        return Date.now()
    }

    /**
     * Helper function to check whether a textbox already exists at a particular line and character position. Searches all textboxes in a line,
     * including both template and snippet textboxes.
     * @param template - The linked template.
     * @param line - The line (relative to the template/snippet) where the textbox is located.
     * @param position - The character position of the textbox in the template (relative to line).
     * @param content - The content of the textbox to search for. 
     * @param snippetId - Optional parameter to search for existing textboxes within a snippet only, excluding template textboxes. 
     * @param checkContent - Optional parameter to exclude textboxes that have the same content as the `content` paramenter
     * 
     * @returns The textbox that is found. If a textbox is not found, `undefined` is returned instead.
     */

    private checkTextboxExists(template: ITemplate, line: number, position: number, content: string, snippetId?: string, checkContent?: boolean): ITextbox | undefined{
        let textboxes = template.textboxes.filter(t => t.line === line);
        if(snippetId){
            textboxes = textboxes.filter(t => t.snippetId === snippetId);
        }
        for(const t of textboxes){
            if(t.from === position || (t.from <= position && t.to >= position + content.length) || t.to === position || t.to === position + content.length){
                if(checkContent){
                    if(t.content !== content){
                        return t;
                    }
                    continue;
                }
                else{
                    return t;
                }
            }
        }
        return;
    }

    /**
     * Helper function to find pairs of neighboring textboxes in a particular snippet.
     * @param snippet - The snippet to search for neighboring textboxes in. 
     * @returns An array of textbox id pairs to be merged
     */

    private checkNeighboring(snippet: ISnippet): number[][]{
        const template = this.templatesManager.get(snippet.template_id);
        const textboxes = template!.textboxes.filter(t => (t.snippetId === snippet.id));
        const lineMap = new Map<number,{from: number, to: number, id: number}[]>();
        const toMerge: number[][] = [];
        for(const t of textboxes){
            if(!(lineMap.has(t.line))){
                lineMap.set(t.line, []);
            }
            lineMap.get(t.line)!.push({
                from: t.from,
                to: t.to,
                id: t.id
            });
        }

        for(const line of lineMap.keys()){
            const lineTextboxes = lineMap.get(line);
            if (!lineTextboxes || lineTextboxes.length < 2){
                continue;
            }

            lineTextboxes.sort((a, b) => a.from - b.from);
            for(let i = 0; i < lineTextboxes.length - 1; i++){
                const curr = lineTextboxes[i];
                const next = lineTextboxes[i + 1];
                if(next.from <= curr.to){
                    toMerge.push([curr.id, next.id]);
                }
            }
        }
        return toMerge;
    }

    /**
     * Function to merge adjacent snippet textboxes.
     * @param template - The linked template.
     * @param ids - Array of textbox id pairs to be merged. 
     */

    private mergeAdjacent(template: ITemplate, ids: number[][]){
        const textboxes = template.textboxes;
        for(const pair of ids){
            const t1 = textboxes.find(t => t.id === pair[0]);
            const t2 = textboxes.find(t => t.id === pair[1]);
            const snippet = this.snippetsManager.snippetTracker.find(s => s.id === t1!.snippetId);
            let newTextboxes : ITextbox[] = [];
            if(!(t1 && t2)) return; 
            if(t2.to > t1.to || (t1.to === t2.to && t1.from > t2.from)){
                newTextboxes = textboxes.filter(t => (t.id !== t1.id));
                this.snippetsManager.removeTextboxDeco(t1.id, snippet!);
            }
            else if(t2.to <= t1.to || t1.to === t2.to && t1.from <= t2.from){
                newTextboxes = textboxes.filter(t => (t.id !== t2.id));
                this.snippetsManager.removeTextboxDeco(t2.id, snippet!);
            }
            template.textboxes = newTextboxes;
        }
    }

    /**
     * Function that replaces an existing textbox with new content, updating the position values accordingly. Used during merges, updates, replacements.
     * 
     * @param textbox - The textbox to be replaced.
     * @param snippet - The snippet where the textbox is located.
     * @param template - The template linked to the snippet.
     * @param line - The line of the textbox.
     * @param content - The updated content that will replace the textbox's old content. 
     * @param backward - Optional parameter indicating whether the replacement involves a backward merge (content inserted to the left of an existing textbox).
     */

    private async replace(textbox: ITextbox, snippet: ISnippet, template: ITemplate, line: number, content: string, backward?: number){
        textbox.content = content;
        if(backward){
            textbox.from = backward;
        }
        else{
            textbox.to = textbox.from + content.length;
        }
        // Remove the old textbox decoration and create a new one
        requestAnimationFrame(() => this.snippetsManager.removeTextboxDeco(textbox.id, snippet));
        await this.snippetsManager.applyHighlights(
            snippet.id,
            template,
            line,
            [textbox.from, textbox.to],
            textbox.id
        );
    }

    /**
     * Function that merges textboxes in the template and snippets that were not edited when a merge occurs.
     * 
     * @param template - The template linked to the snippet.
     * @param editedSnippet - The snippet that was edited.
     * @param line - The line of the textbox
     * @param position - The position of the textbox that will be merged.
     * @param content - The updated content for the template textbox. 
     * @param offset - The character offset to expand the textbox.
     * @param backward - Optional parameter indicating whether the replacement involves a backward merge (content inserted to the left of an existing textbox).
     */

    private async merge(template: ITemplate, editedSnippet: string, line: number, position: number, content: string, offset: number, backward?: boolean){
        const snippets = this.snippetsManager.getSnippets(template.id)
        const tTextbox = this.checkTextboxExists(template, line, position, content);
        if(tTextbox){
            tTextbox.content = content;
            if(backward){
                tTextbox.from = tTextbox.from - offset;
            }
            else{
                tTextbox.to = tTextbox.from + content.length;
            }
        }
        for(const snippet of snippets){
            if(snippet.id === editedSnippet) continue;

            const contentByLines = snippet.content.split('\n');
            let t = backward ? this.checkTextboxExists(template, line, position + offset, content, snippet.id)
                : this.checkTextboxExists(template, line, position, content, snippet.id);

            if(t){
                if(backward){
                    t.from = t.from - offset;
                }
                else{
                    t.to = t.to + offset
                }
                const newContent = contentByLines[line].slice(t.from, t.to);
                t.content = newContent
                await this.snippetsManager.applyHighlights(
                    snippet.id,
                    template,
                    line,
                    [t.from, t.to],
                    t.id
                );
            }
            else{
                console.warn("textbox not found, all textboxes within the snippet: ", template.textboxes.filter(t => t.snippetId === snippet.id));
            }
        }
    }

    /**
     * Helper function to help calculate the positions of textboxes in non-edited snippets. Calculates the position based on the to value of the previous
     * textbox within the line and an offset of the number of characters between the previous textbox and the textbox to be inserted (given by the template's textbox).
     * 
     * @param template - The template linked to the snippet.
     * @param snippet - The snippet where the textbox will be inserted.
     * @param line - The line (relative to the template/snippet) where the textbox is located.
     * @param tp - Template position: character position of the textbox in the template (relative to line).
     * @param sp - Snippet position: character position of the textbox in the snippet (relative to line).
     * @returns The `from` value of the textbox.
     */

    private calculatePosition(template: ITemplate, snippet: ISnippet, line: number, tp: number, sp: number): number{
        let from;
        // Find the textboxes before the given positions in both the snippets and templates
        let sTextboxesBefore = template.textboxes.filter(t => t.snippetId === snippet.id && t.line === line && t.from < tp);
        let tTextboxesBefore = template.textboxes.filter(t => !t.snippetId && t.line === line && t.from < tp);

        if(sTextboxesBefore.length > 0){
            sTextboxesBefore = sTextboxesBefore.sort((a,b) => a.from - b.from);
            tTextboxesBefore = tTextboxesBefore.sort((a,b) => a.from - b.from);

            let sPrev = sTextboxesBefore[sTextboxesBefore.length - 1];
            const tPrev = tTextboxesBefore[tTextboxesBefore.length - 1];
            // Calculate the number of characters between the previous textbox and the current textbox (using the template as the standard)
            const offset = tp - tPrev.to;
            from = sPrev.to + offset;
            return from
        }
        return sp
    }

    /**
     * Helper function to normalize the positions of placeholders when an empty textbox is added to the template.
     * In templates, empty textboxes come from insertion diffs and result in an offset of 1-2 characters depending on what was inserted.
     * @param lineTokens - Set of textboxes/tokens in a line
     * @param line  - The line's content 
     */

    private normalizePositions(lineTokens: ITextbox[], line: string){
        if(lineTokens.find(c => c.content === '')){
            // Decrement since lineTokens is sorted in descending order
            for(let i = lineTokens.length - 1; i >= 0; i--){
                let p = i - 1;
                const curr = lineTokens[i];
                 // If the current textbox is empty, normalize the positions of the following textboxes
                if(curr.content === ''){
                    const prevChar = line.slice(curr.from - 1, curr.from);
                    while(p >= 0 && p !== i){
                        // If the insertion doesn't contain a space (the previous character is not a space), only increment the following textboxes by 1
                        if(!(/\s/.test(prevChar))){
                            lineTokens[p].from += 1
                        }
                        lineTokens[p].from -= 2;
                        p--;
                    }
                }
            }
        }
    }

    /**
     * Helper function to handle all cases for adding empty placeholders/textboxes in templates.
     * 
     * @param token - The token/textbox to be added.
     * @param line - The line where the placeholder will be added.
     * 
     * @returns The line with the added placeholder. 
     */

    private addEmptyTextbox(token: ITextbox, line: string): string{
        // Different from and to lengths indicate that the token was inserted with a space
        if(token.from !== token.to){
            if(token.from > line.length){
                line = line.slice(0, line.length) + ` {{}}`;
            }
            else{
                line = line.slice(0, token.from - 1) + ` {{}}` + line.slice(token.from - 1);
            }
        }
        else{
            if(token.from === line.length){
                line = line.slice(0, line.length) + `{{}}`;
            }
            else{
                const prevChar = line.slice(token.from - 1, token.from);
                if(!(/\s/.test(prevChar))){
                    line = line.slice(0, token.from) + `{{}}` + line.slice(token.from);
                }
                else{
                    // If the previous character is a space, preserve the space
                    line = line.slice(0, token.from) + `{{}}` + line.slice(token.from - 1);
                }
            }
        }
        return line;
    }

    /**
     * Method that updates the template content with placeholders ({{}}) where textboxes are rendered in the library. 
     * @param template - The template to be updated. 
     * @returns The updated template content with placeholders.
     */

    private addPlaceholders(template: ITemplate): string{
        const textboxes = template.textboxes.filter(t => !t.snippetId).map(t => ({ ...t }));;
        const content = this.templatesManager.getContent(template.id, true);
        const lines = content.split('\n');

        // Map the tokens/textboxes by line. Each line is mapped to an array of textboxes in that line
        const tokensByLine = new Map<number, ITextbox[]>();
        for(const textbox of textboxes){
            if(!tokensByLine.has(textbox.line)){
                tokensByLine.set(textbox.line, []);
            }
            tokensByLine.get(textbox.line)!.push(textbox);
        }

        for(let[i, lineTokens] of tokensByLine.entries()){
            if(i < 0 || i >= lines.length) continue;

            let line = lines[i];
            // Sort the array of textboxes in descending order to ensure placeholders are inserted at the correct positions as the line updates
            lineTokens = lineTokens.sort((a, b) => b.from - a.from);
            this.normalizePositions(lineTokens, line);
        
            for(const token of lineTokens){
                if(lineTokens.length === 0) continue;

                if(token.from < 0 || token.from > line.length){
                    console.warn("the position is out of bounds: ", token.from);
                }
                // Case 1 : The content already exists in the template, insert placeholders around the existing text
                if(token.content.length > 0){
                    // Make sure the text sliced isn't out of bounds
                    const endPosition = Math.min(token.from + token.content.length, line.length);
                    line = line.slice(0, token.from) + `{{${token.content}}}` + line.slice(endPosition);
                }
                // Case 2 : The content doesn't already exist in the template (due to an insertion), insert an empty textbox
                else{
                    line = this.addEmptyTextbox(token, line);
                }
            }
            lines[i] = line;
        }
        return lines.join('\n');
    }

    /**
     * Method that creates textboxes in templates.
     * @param template - The template where the textbox is created.
     * @param line - The line (relative to the template/snippet) where the textbox is located.
     * @param position - The character position of the textbox in the template (relative to line).
     * @param content - The content of the textbox (original text).
     * @param spaceBefore - Optional parameter indicating whether the textbox was created with a space before the insertion. 
     */

    private templateTextboxDispatcher(template: ITemplate, line: number, position: number, content: string, sharedId : number, spaceBefore?: boolean){
        // Check to prevent extra textboxes from being created
        if(template.textboxes.find(t => t.line === line && (t.from === position))) return;

        const existingTemplateTextbox = template.textboxes.find(t => t.line === line && (t.to === position + content.length));
        if(existingTemplateTextbox){
            if(position < existingTemplateTextbox.from){
                template.textboxes = template.textboxes.filter(t => t.id !== existingTemplateTextbox.id);
            }
        }

        // If an insertion textbox was created, we need to update the positions of the template textboxes following the textbox that was created
        const textboxesAfter = template.textboxes.filter(t => t.line === line && t.from > position && !t.snippetId);
        if(content.length == 0 && textboxesAfter){
            for(const t of textboxesAfter){
                if(spaceBefore){
                    t.from += 2;
                    t.to += 2;
                }
                else{
                    t.from += 1;
                    t.to += 1;
                }
            }
        }
        const textbox = {
            id: this.generateTextboxId(),
            content: content,
            line: line,
            from: position,
            to: position + content.length,
            templateId: template.id,
            sharedId : sharedId
        }
        if(spaceBefore){
            textbox.to += 1;
        }
        template.textboxes.push(textbox);
        this.libraryWidget?.update()
    }

    /**
     * Method that creates textboxes in snippets. Dispatches textboxes in both the edited snippet and other snippet instances of the same template.
     * @param template - The linked template.
     * @param editedSnippet - The snippet that was edited/has diffs.
     * @param newContent - The content of the textbox after the change (in the edited snippet).
     * @param oldContent - The original content of the textbox before the change.
     * @param line - The line (relative to the template/snippet) where the textbox is located.
     * @param sp - Snippet position: character position of the textbox in the snippet (relative to line).
     * @param tp - Template position: character position of the textbox in the template (relative to line).
     * @param spaceBefore - Optional parameter indicating whether the textbox was created with a space before the insertion. 
     */
    
    private async snippetTextboxDispatcher(template: ITemplate, editedSnippet: ISnippet, newContent: string, oldContent: string, line: number, sp: number, tp: number, sharedId : number, spaceBefore?: boolean){
        const snippets = this.snippetsManager.getSnippets(template.id);
        const tTextbox = template.textboxes.find(t => !t.snippetId && t.from === tp && t.line === line);
        for(const snippet of snippets){
            let textbox = {
                id: this.generateTextboxId(),
                content: newContent,
                line: line,
                from: sp,
                to: sp + newContent.length,
                templateId: snippet.template_id,
                snippetId: snippet.id,
                sharedId : sharedId
            };
            if(snippet.id === editedSnippet.id){
                template.textboxes.push(textbox);
                if(newContent.length === 0){
                    this.ignoreUpdate.add(textbox.id);
                    await this.snippetsManager.applyHighlights(
                        snippet.id,
                        template,
                        line,
                        [textbox.from, textbox.to],
                        textbox.id,
                        true
                    );
                    textbox.to += 1;
                }
                else{
                    await this.snippetsManager.applyHighlights(
                        snippet.id,
                        template,
                        line,
                        [textbox.from, textbox.to],
                        textbox.id,
                    );
                }
            }
            else{
                textbox.content = oldContent;
                const toMerge = this.checkNeighboring(snippet);
                if(toMerge.length > 0){
                    this.mergeAdjacent(template, toMerge);
                    if(tTextbox && tTextbox.content !== oldContent){
                        tTextbox.content = oldContent
                        tTextbox.to = tTextbox.from + oldContent.length;
                    }
                }
                textbox.from =  this.calculatePosition(template, snippet, line, tp, sp);
                textbox.to = textbox.from + oldContent.length;
                if(spaceBefore){
                    textbox.to += 1
                    template.textboxes.push(textbox);
                    this.ignoreUpdate.add(textbox.id);
                    await this.snippetsManager.applyHighlights(
                        snippet.id,
                        template,
                        line,
                        [textbox.from, textbox.from + 1],
                        textbox.id,
                        true
                    );
                }
                else if(oldContent.length === 0){
                    template.textboxes.push(textbox);
                    await this.snippetsManager.applyHighlights(
                        snippet.id,
                        template,
                        line,
                        [textbox.from, textbox.to],
                        textbox.id,
                        true
                    );
                }
                else{
                    template.textboxes.push(textbox);
                        await this.snippetsManager.applyHighlights(
                        snippet.id,
                        template,
                        line,
                        [textbox.from, textbox.to],
                        textbox.id,
                    );
                }
            }  
            const toMerge = this.checkNeighboring(snippet);
            if(toMerge.length > 0){
                this.mergeAdjacent(template, toMerge);
                // Update the template textbox accordingly
                if(tTextbox && tTextbox.content !== oldContent){
                    tTextbox.content = oldContent
                    tTextbox.to = tTextbox.from + oldContent.length;
                }
            }
        }
        this.libraryWidget?.update()
    }

    /**
     * Helper function to handle the replacement case in `diffCheck()`. This case is 
     * 
     * @param template - The template that was compared.
     * @param snippet - The snippet that was compared. 
     * @param i - The line number of the token. 
     * @param sp - The snippet pointer.
     * @param tp - The template pointer.
     * @param oldContent - The token that was replaced.
     * @param newContent - The content that replaced the initial token.
     * @param inserted - The amount of characters inserted from the document update. Negative if characters were removed.
     */

    private handleReplace(template: ITemplate, snippet: ISnippet, i: number, sp: number, tp: number, oldContent: string, newContent: string, inserted: number){
        if(inserted < 0){
            inserted += 1;
        }
        // Check if a textbox already exists
        const existingTextbox = this.checkTextboxExists(template!, i, sp, newContent);
        let snippetExistingTextbox = this.checkTextboxExists(template!, i, sp, newContent, snippet.id, true);
        // If a textbox doesn't exist, create a new template textbox and dispatch snippet textboxes
        if(!existingTextbox){
            const sharedId = this.generateSharedId()
            this.templateTextboxDispatcher(template!, i, tp, oldContent, sharedId);
            this.snippetTextboxDispatcher(template!, snippet, newContent, oldContent, i, sp, tp, sharedId);  
        }
        
        // The following code handles merge cases

        // Since some merges can involve 2+ existing textboxes, use a while loop + counter
        let counter = 0;
        while(snippetExistingTextbox){
            // Previous iteration of while loop already merged the textboxes, remove remaining textboxes
            if(counter >= 1){
                template.textboxes = template.textboxes.filter(t => t.id !== snippetExistingTextbox!.id && (t.sharedId !== snippetExistingTextbox!.sharedId));
            }
            else{
                // Calculate offset for merging
                let offset = (sp + newContent.length - inserted) - snippetExistingTextbox.to;
                // Do not include inserted in the offset calculation to check if the offset is negative (backwards merge)
                if(inserted < 0){
                    offset = (sp + newContent.length) - snippetExistingTextbox.to;
                }

                if(offset <= 0){
                    console.log("backward merge");
                    offset = snippetExistingTextbox.from - inserted - sp;
                    this.replace(snippetExistingTextbox, snippet, template!, i, newContent, sp);

                    // This case only runs when there are multiple textboxes to be merged
                    const existingTextbox = this.checkTextboxExists(template!, i, sp, newContent, snippet.id, true);
                    if(existingTextbox){
                        const existingTemplateTextbox = template.textboxes.find(t => t.sharedId === existingTextbox!.sharedId && !t.snippetId);
                        if(existingTemplateTextbox){
                            // Necessary to update the offset due to extra characters from other textboxes
                            offset -= (existingTextbox.content.length - existingTemplateTextbox.content.length)
                        }
                    }

                    this.merge(template!, snippet.id, i, tp, oldContent, offset, true);
                }
                else{
                    console.log("forward merge");
                    this.replace(snippetExistingTextbox, snippet, template!, i, newContent);
                    const existingTextbox = this.checkTextboxExists(template!, i, sp, newContent, snippet.id, true);
                    if(existingTextbox){
                        const existingTemplateTextbox = template.textboxes.find(t => t.sharedId === existingTextbox!.sharedId && !t.snippetId);
                        if(existingTemplateTextbox){
                            offset -= (existingTextbox.content.length - existingTemplateTextbox.content.length)
                        }
                    }
                    this.merge(template!, snippet.id, i, tp, oldContent, offset)
                }
            }
            snippetExistingTextbox = this.checkTextboxExists(template!, i, sp, newContent, snippet.id, true);
            counter += 1;
        }
    }

    /**
     * Method comparing a particular snippet with its linked template. When diffs are detected, textboxes are created depending on the type of diff.
     * The three main types of diffs are replacements, removals, and insertions. 
     * 
     * @param snippet - The snippet to be compared.
     * @param inserted - The amount of characters inserted from the document update. Negative if characters were removed.
     */

    diffCheck(snippet: ISnippet, inserted: number){
        if(this.ignoreDiff.has(snippet.id)){
            this.ignoreDiff.delete(snippet.id);
            return;
        }

        const template = this.templatesManager.get(snippet.template_id);
        const templateContent = this.templatesManager.getContent(template!.id, true);
        const sLines = snippet.content.split('\n');
        const tLines = templateContent.split('\n');

        if(sLines.length !== tLines.length){
            console.warn("the number of lines in the snippet is different from the number of lines in the template");
            return;
        }

        for(let i = 0; i < tLines.length; i++){
            const tLine = tLines[i];
            const sLine = sLines[i];
            
            if(tLine === sLine){
                continue;
            }

            const diffs = diffWords(tLine, sLine);
            let sp = 0;
            let tp = 0;
            for(let j = 0; j < diffs.length; j++){
                const diff = diffs[j];
                if(diff.removed){
                    // Case 1 : A token was replaced with a new token.
                    if(j + 1 < diffs.length && diffs[j + 1].added){
                        console.log(`${diff.value} replaced at position ${sp} with ${diffs[j + 1].value}`);
                        this.handleReplace(template!, snippet, i, sp, tp, diff.value, diffs[j + 1].value, inserted);
                        // Increment the snippet pointer and template pointers accordingly and increment j since we handle diffs[j + 1] in this case
                        sp += diffs[j + 1].value.length;
                        tp += diffs[j].value.length;
                        j += 1;
                        continue;
                    }
                    else{
                        // Case 2 : A token was deleted
                        console.log(`${diff.value} removed at position ${sp}`);
                        // Check if a textbox exists using both the positions from sp and tp due to potential differences in line length from prior removals/insertions.
                        if(!this.checkTextboxExists(template!, i, sp, "") && (!this.checkTextboxExists(template!, i, tp, ""))){
                            const sharedId = this.generateSharedId()
                            this.templateTextboxDispatcher(template!, i, tp, diff.value, sharedId);
                            this.snippetTextboxDispatcher(template!, snippet, "", diff.value, i, sp, tp, sharedId);
                        }
                        // Only increment the the template pointer
                        tp += diff.value.length - 1;
                    } 
                }
                else if(diff.added){
                    // Case 3 : A new token was inserted.
                    console.log(`${diff.value} added at position ${sp}`);
                    let existingTextbox = this.checkTextboxExists(template!, i, sp, diff.value, snippet.id);
                    // Trim any whitespace to prevent extra spaces from being included in the textbox
                    const token = diff.value.trim();
                    let spaceBefore = false;
                    let prev = diffs[j - 1];
                    if(prev){
                        spaceBefore = /\s/.test(prev.value[prev.value.length - 1])
                    }
                    if(!existingTextbox){
                        const sharedId = this.generateSharedId()
                        this.templateTextboxDispatcher(template!, i, tp, "",  sharedId, spaceBefore);
                        this.snippetTextboxDispatcher(template!, snippet, token, "", i, sp, tp, sharedId, spaceBefore);
                    }
                    else{
                        this.replace(existingTextbox, snippet, template!, i, token);
                    }
                    sp += diff.value.length;
                    // Incrememnt the template pointer by 2 to normalize
                    tp += 2;
                }
                else{
                    sp += diff.value.length;
                    tp += diff.value.length;
                }
            }
        }
        // After all textboxes have been created, update the template content with placeholders
        requestAnimationFrame(() => {
            const newTemplateContent = this.addPlaceholders(template!);

            if(newTemplateContent !== template!.content){
                this.templatesManager.edit(template!.id, newTemplateContent);
                // Dispatch a custom event to immediately update the libary view with the updated template content
                const updateLibrary = new CustomEvent('updateLibrary', {detail:{value: newTemplateContent}});
                document.dispatchEvent(updateLibrary);
            }
        });
    }

    /**
     * Updates the positions of all textboxes in a particular snippet when the document is updated.
     * @param snippet - The snippet that is being updated.
     * @param update - ViewUpdate object holding changes from the update.
     * @param view - EditorView object holding the document state of a particular cell.
     */

    async updateTextboxes(snippet: ISnippet, update: ViewUpdate, view: EditorView){
        const doc = view.state.doc;
        const oldDoc = update.startState.doc;
        const template = this.templatesManager.get(snippet.template_id);
        const textboxes = template!.textboxes.filter(t => t.snippetId === snippet.id);
        const updatedTextboxes: ITextbox[] = [];
        if(textboxes.length !== 0){
            update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                const insertedLines = inserted.toString().split("\n").length - 1; 
                const removedLines = oldDoc.lineAt(toA).number - oldDoc.lineAt(fromA).number;
                const oldSnippetLine = snippet.start_line - (insertedLines - removedLines);
                const updateFrom = doc.lineAt(fromA).number;

                for(const textbox of textboxes){
                    if(this.ignoreUpdate.has(textbox.id)){
                        this.ignoreUpdate.delete(textbox.id);
                        continue;
                    }
                    const textboxLine = (oldSnippetLine + textbox.line);
                    if(updateFrom > (snippet.start_line + textbox.line)){
                        continue;
                    }
                    else if(updateFrom == textboxLine){   
                        const updateOffset = fromA - doc.line(textboxLine).from;
                        // Update the from and to values of the textbox if the update was before the textbox
                        if(updateOffset < textbox.from){
                            const delta = inserted.length - (toA - fromA);
                            textbox.from += delta;
                            textbox.to += delta;
                        }
                        else if(textbox.from <= updateOffset && updateOffset <= textbox.to){
                            if(inserted.length === 0 && (toA - fromA) > 0){
                                const textboxLineStart = doc.line(textboxLine).from
                                const newContent = doc.sliceString(textboxLineStart + textbox.from, textboxLineStart + textbox.to - (toA - fromA));
                                this.replace(textbox, snippet, template!, textbox.line, newContent);
                                
                            }
                            else{
                                const textboxLineStart = doc.line(textboxLine).from
                                const newContent = doc.sliceString(textboxLineStart + textbox.from, textboxLineStart + textbox.to + inserted.length);
                                this.replace(textbox, snippet, template!, textbox.line, newContent);
                            }
                            this.ignoreDiff.add(snippet.id);
                            continue;
                        }
                    }
                    updatedTextboxes.push(textbox);
                    this.snippetsManager.applyHighlights(
                        textbox.snippetId!,
                        template!,
                        textbox.line,
                        [textbox.from, textbox.to],
                        textbox.id
                    );
                }
            });

            // Batch textbox updates in a set of promises
            const promises = updatedTextboxes.map((textbox) => {
                return this.snippetsManager.applyHighlights(
                    textbox.snippetId!,
                    template!,
                    textbox.line,
                    [textbox.from, textbox.to],
                    textbox.id
                );
            });
            await Promise.all(promises);
            console.log("all textboxes in the template: ", template?.textboxes);
        }
    }

    /**
     * Handles textbox creation when a template is dropped into the document.
     * @param snippet - The snippet that is being created when the template is dropped.
     */

    dropTextboxes(snippet: ISnippet){
        const template = this.templatesManager.get(snippet.template_id);
        if(!template) return;
        const textboxes = template.textboxes.filter(t => !t.snippetId);
        let lines = snippet.end_line - snippet.start_line;
        let textboxMap = new Map<number, ITextbox[]>();
        while(lines >= 0){
            textboxMap.set(lines, []);
            lines--;
        }
        
        for(const t of textboxes){
            const textbox = {
                id: this.generateTextboxId(),
                content: t.content,
                line: t.line,
                from: t.from,
                to: t.to,
                templateId: t.templateId,
                snippetId: snippet.id,
                sharedId: t.sharedId
            }
            template.textboxes.push(textbox);
            textboxMap.get(t.line)!.push(textbox);
        }

        for(const k of textboxMap.keys()){
            const arr = textboxMap.get(k);
            for(const t of arr!){
                // this.ignoreUpdate.add(t.id);
                if(t.content === ''){
                    this.snippetsManager.applyHighlights(
                        snippet.id,
                        template,
                        k,
                        [t.from, t.from],
                        t.id,
                        true,
                    );
                }
                else{
                    this.snippetsManager.applyHighlights(
                    snippet.id,
                    template,
                    k,
                    [t.from, t.to],
                    t.id,
                    );
                }
            }
        }
    }
}