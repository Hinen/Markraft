import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// CSS variables follow Light/Dark/System immediately, including mounted,
// inactive editors. Supplying a highlighter replaces basicSetup's light fallback.
export const syntaxTheme = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.comment, color: 'var(--syntax-comment)' },
    { tag: [tags.propertyName, tags.attributeName], color: 'var(--syntax-property)' },
    { tag: [tags.string, tags.character], color: 'var(--syntax-string)' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-literal)' },
    { tag: [tags.keyword, tags.modifier], color: 'var(--syntax-keyword)' },
    { tag: [tags.tagName, tags.typeName, tags.className], color: 'var(--syntax-tag)' },
    { tag: [tags.operator, tags.punctuation, tags.meta], color: 'var(--syntax-punctuation)' },
    { tag: tags.heading, color: 'var(--syntax-property)', fontWeight: '700' },
    { tag: tags.link, color: 'var(--syntax-property)', textDecoration: 'underline' },
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.invalid, color: 'var(--syntax-invalid)' },
  ]),
);
