import { describe, expect, it } from "vitest";

import { distinctProjects } from "@/features/inventory/lib/focusProjects";

describe("distinctProjects", () => {
  it("returns sorted, de-duped labels from project-list to-dos only", () => {
    const todos = [
      { list: "project", project: "Garage buildout" },
      { list: "project", project: "Garage buildout" }, // dupe
      { list: "project", project: "Bike tune-up" },
      { list: "personal", project: "Should be ignored" }, // wrong list
      { list: "project", project: "  " }, // blank
      { project: "No list field" }, // legacy → not project
    ];
    expect(distinctProjects(todos)).toEqual(["Bike tune-up", "Garage buildout"]);
  });

  it("de-dupes case-insensitively, keeping the first spelling", () => {
    const todos = [
      { list: "project", project: "Kitchen" },
      { list: "project", project: "kitchen" },
    ];
    expect(distinctProjects(todos)).toEqual(["Kitchen"]);
  });

  it("is defensive about junk input", () => {
    expect(distinctProjects(null)).toEqual([]);
    expect(distinctProjects("nope")).toEqual([]);
    expect(distinctProjects([null, 42, { list: "project" }])).toEqual([]);
  });
});
