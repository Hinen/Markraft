import { syntaxes, type SyntaxId } from './syntaxRegistry';
export type FileType = SyntaxId;
export function fileType(name: string): FileType {
  const basename = name.split(/[\\/]/).pop()!.toLowerCase();
  return (
    syntaxes.find((syntax) => syntax.extensions.some((ext) => basename.endsWith(`.${ext}`)))?.id ??
    'text'
  );
}
export function normalize(text: string) {
  return text.replace(/\r\n/g, '\n');
}
export function lineEnding(text: string): 'LF' | 'CRLF' {
  return text.includes('\r\n') ? 'CRLF' : 'LF';
}
