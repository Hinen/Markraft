export type FileType = 'markdown' | 'text' | 'yaml' | 'xml';
export function fileType(name: string): FileType {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown'
    ? 'markdown'
    : ext === 'yaml' || ext === 'yml'
      ? 'yaml'
      : ext === 'xml'
        ? 'xml'
        : 'text';
}
export function normalize(text: string) {
  return text.replace(/\r\n/g, '\n');
}
export function lineEnding(text: string): 'LF' | 'CRLF' {
  return text.includes('\r\n') ? 'CRLF' : 'LF';
}
