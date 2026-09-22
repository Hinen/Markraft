import { detectSyntax, type SyntaxId } from './syntaxRegistry';
export type FileType = SyntaxId;
export function fileType(name: string): FileType {
  return detectSyntax(name)?.id ?? 'text';
}
export function normalize(text: string) {
  return text.replace(/\r\n/g, '\n');
}
export function lineEnding(text: string): 'LF' | 'CRLF' {
  return text.includes('\r\n') ? 'CRLF' : 'LF';
}
