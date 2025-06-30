/* eslint-disable prettier/prettier */
import { EditorView, keymap } from '@codemirror/view';

let triggeredByCtrlEnter = false;

export const customKeymap = keymap.of([
  {
    key: 'Ctrl-Shift-Enter', run: exitSnippet
  }
]);

export function exitSnippet(view: EditorView): boolean {
  setTriggeredByCtrlEnter(true);
  const { state } = view;
  const changes = {
    from: state.selection.main.from,
    to: state.selection.main.to,
    insert: '\n',
  };
  view.dispatch({ changes });
  return true; 
}

export function setTriggeredByCtrlEnter(value: boolean) {
  triggeredByCtrlEnter = value;
}

export function getTriggeredByCtrlEnter() {
  return triggeredByCtrlEnter;
}

