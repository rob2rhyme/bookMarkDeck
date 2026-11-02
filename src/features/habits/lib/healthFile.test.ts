import { describe, expect, it } from "vitest";

import { makeZip } from "@/test/makeZip";
import { HealthImportError, listZip, readHealthFile, readHealthFiles } from "@/features/habits/lib/healthFile";

const file = (data: Buffer | string, name: string) =>
  new File([typeof data === "string" ? data : new Uint8Array(data)], name);

const XML =
  `<HealthData><Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" ` +
  `startDate="2026-03-05 08:00:00 -0500" endDate="2026-03-05 08:10:00 -0500" value="8123"/></HealthData>`;

describe("listZip", () => {
  it("lists entries with their data offsets, stored and deflated", async () => {
    const zip = file(makeZip([{ name: "a.txt", data: "hello", method: 0 }, { name: "dir/b.txt", data: "world".repeat(50) }]), "x.zip");
    const entries = await listZip(zip);
    expect(entries.map((e) => [e.name, e.method, e.size])).toEqual([
      ["a.txt", 0, 5],
      ["dir/b.txt", 8, 250],
    ]);
  });

  it("reads a ZIP64 directory (sizes and offsets in the extra field)", async () => {
    const zip = file(makeZip([{ name: "export.xml", data: XML }], { zip64: true }), "x.zip");
    const [e] = await listZip(zip);
    expect(e).toMatchObject({ name: "export.xml", method: 8, size: XML.length });
  });

  it("refuses a file that isn't a ZIP", async () => {
    await expect(listZip(file("just some text", "x.zip"))).rejects.toBeInstanceOf(HealthImportError);
  });
});

describe("readHealthFile", () => {
  it("reads an Apple export.zip (export.xml inside a folder, beside other entries)", async () => {
    const zip = makeZip([
      { name: "apple_health_export/export_cda.xml", data: "<ClinicalDocument/>" },
      { name: "apple_health_export/export.xml", data: XML },
    ]);
    const d = await readHealthFile(file(zip, "export.zip"));
    expect(d.get("2026-03-05")?.steps).toBe(8123);
  });

  it("reads the same export through a ZIP64 directory", async () => {
    const zip = makeZip([{ name: "apple_health_export/export.xml", data: XML }], { zip64: true });
    expect((await readHealthFile(file(zip, "export.zip"))).get("2026-03-05")?.steps).toBe(8123);
  });

  it("reads a bare export.xml, reporting progress up to done", async () => {
    const seen: number[] = [];
    const d = await readHealthFile(file(XML, "export.xml"), (p) => seen.push(p));
    expect(d.get("2026-03-05")?.steps).toBe(8123);
    expect(seen.every((p) => p >= 0 && p <= 1)).toBe(true);
  });

  it("reads a CSV, and the Fit CSVs inside a Takeout zip (the larger value where two files overlap)", async () => {
    const csv = "Date,Step count\n2026-03-05,7000\n";
    expect((await readHealthFile(file(csv, "steps.csv"))).get("2026-03-05")?.steps).toBe(7000);

    const zip = makeZip([
      { name: "Takeout/Fit/Daily activity metrics/Daily activity metrics.csv", data: "Date,Step count\n2026-03-05,7000\n2026-03-06,100\n" },
      { name: "Takeout/Fit/Daily activity metrics/2026-03-05.csv", data: "Start time,End time,Step count\n2026-03-05T00:00:00-05:00,2026-03-05T01:00:00-05:00,3000\n2026-03-05T01:00:00-05:00,2026-03-05T02:00:00-05:00,4100\n" },
      { name: "Takeout/Fit/readme.txt", data: "not csv" },
    ]);
    const d = await readHealthFile(file(zip, "takeout.zip"));
    expect(d.get("2026-03-05")?.steps).toBe(7100); // 7000 vs 3000+4100: the larger, not 14100
    expect(d.get("2026-03-06")?.steps).toBe(100);
  });

  it("says plainly what is wrong with a file it can't use", async () => {
    await expect(readHealthFile(file(makeZip([{ name: "photos/a.jpg", data: "x" }]), "x.zip"))).rejects.toThrow(/export\.xml/);
    await expect(readHealthFile(file("name,value\na,1\n", "x.csv"))).rejects.toThrow(/date column/);
    await expect(readHealthFile(file("garbage", "broken.zip"))).rejects.toBeInstanceOf(HealthImportError);
  });
});

describe("readHealthFiles", () => {
  it("merges several files, the larger value winning", async () => {
    const d = await readHealthFiles([
      file("Date,Step count\n2026-03-05,6000\n", "a.csv"),
      file("date,steps,sleep hours\n2026-03-05,6500,7\n", "b.csv"),
    ]);
    expect(d.get("2026-03-05")).toEqual({ steps: 6500, sleepHours: 7 });
  });
});
