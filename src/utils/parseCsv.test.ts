import { describe, expect, it } from "vitest";

import { parseCsv } from "./parseCsv";

describe("parseCsv", () => {
  it("splits plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("reads quoted fields: commas, doubled quotes and line breaks inside them", () => {
    expect(parseCsv('t,n\n"a, b","say ""hi"""\n"line1\nline2",x\n')).toEqual([
      ["t", "n"],
      ["a, b", 'say "hi"'],
      ["line1\nline2", "x"],
    ]);
  });

  it("accepts CRLF, a leading BOM and no trailing newline", () => {
    expect(parseCsv("﻿a,b\r\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps empty cells and skips blank lines", () => {
    expect(parseCsv("a,b,c\n\n1,,3\n\n")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});
