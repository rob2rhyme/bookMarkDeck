// A small CSV reader for bookmark exports (RFC 4180): quoted fields, doubled
// quotes, commas and line breaks inside quotes, CRLF or LF, and a leading BOM
// (Excel and Raindrop both write one). Returns rows of cells; it does not guess
// at headers. Pure — see parseCsv.test.ts.

export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let sawAnything = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    // A blank line is not a row.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    sawAnything = true;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") endCell();
    else if (ch === "\n") endRow();
    else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else cell += ch;
  }
  if (sawAnything && (cell !== "" || row.length > 0)) endRow();
  return rows;
}
