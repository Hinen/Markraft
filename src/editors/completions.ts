import { EditorState, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import type { SyntaxId } from '../files/syntaxRegistry';
import {
  acceptCompletion,
  autocompletion,
  completeAnyWord,
  type CompletionSource,
} from '@codemirror/autocomplete';

export const documentWords: CompletionSource = async (context) => {
  if (!context.explicit || context.view?.composing || !context.state.selection.main.empty)
    return null;
  const word = context.state.wordAt(context.pos);
  const prefix = word ? context.state.sliceDoc(word.from, context.pos) : '';
  const result = await completeAnyWord(context);
  if (!result || context.aborted) return null;
  return {
    ...result,
    options: result.options
      .filter((option) => option.label !== prefix && !/^\p{Number}+$/u.test(option.label))
      // No extra detail/type: let CodeMirror merge identical language suggestions.
      .map(({ label }) => ({ label })),
  };
};

export const completionExtensions = [
  // Add a source rather than overriding the language package's own completions.
  EditorState.languageData.of(() => [{ autocomplete: documentWords }]),
  autocompletion({ selectOnOpen: false, activateOnTypingDelay: 150, maxRenderedOptions: 30 }),
  // A deliberate selection is required. Otherwise Tab keeps its indentation role.
  Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
];

export const completionBehavior = (syntax: SyntaxId) =>
  autocompletion({ activateOnTyping: syntax !== 'text' && syntax !== 'markdown' });
