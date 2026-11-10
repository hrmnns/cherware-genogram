export function fitNameFontSize(name: string, availableWidth: number, maxSize: number, minSize: number): number {
  const longestWord = Math.max(1, ...name.trim().split(/\s+/).map((word) => [...word].length));
  return Math.round(Math.max(minSize, Math.min(maxSize, availableWidth / (longestWord * 0.62))) * 10) / 10;
}

export function wrapName(value: string, maxCharacters: number): string[] {
  const limit = Math.max(1, maxCharacters);
  const lines: string[] = [];
  let line = '';
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    if (word.length > limit) {
      if (line) { lines.push(line); line = ''; }
      for (let offset = 0; offset < word.length; offset += limit) {
        const part = word.slice(offset, offset + limit);
        if (part.length === limit && offset + limit < word.length) lines.push(part);
        else line = part;
      }
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
