import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
const manifestPath = join(publicDir, "years", "pictures.json");
const allowedLicence = /^(?:Public domain|CC0(?: 1\.0)?|CC BY(?:-SA)? (?:2\.0|2\.5|3\.0|4\.0)(?: [A-Z]{2,3})?)$/i;

assert.ok(existsSync(manifestPath), "years/pictures.json exists");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function uint24le(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", path + " has a RIFF header");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP", path + " is a WebP file");
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const kind = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (kind === "VP8X" && length >= 10) {
      return { width: uint24le(buffer, data + 4) + 1, height: uint24le(buffer, data + 7) + 1 };
    }
    if (kind === "VP8L" && length >= 5) {
      assert.equal(buffer[data], 0x2f, path + " has a valid VP8L signature");
      const width = 1 + buffer[data + 1] + ((buffer[data + 2] & 0x3f) << 8);
      const height = 1 + (buffer[data + 2] >> 6) + (buffer[data + 3] << 2) + ((buffer[data + 4] & 0x0f) << 10);
      return { width, height };
    }
    if (kind === "VP8 " && length >= 10) {
      assert.equal(buffer.toString("hex", data + 3, data + 6), "9d012a", path + " has a valid VP8 frame header");
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    offset = data + length + (length % 2);
  }
  assert.fail(path + " has no supported WebP image chunk");
}

let totalPictures = 0;
let totalBytes = 0;
let overTarget = 0;
const counts = [];
const listedFiles = new Set();
const sourceUrls = new Set();

for (let year = 1998; year <= 2026; year++) {
  const key = String(year);
  assert.ok(Object.hasOwn(manifest, key), key + " has a manifest entry");
  assert.ok(Array.isArray(manifest[key]), key + " manifest entry is an array");
  counts.push(key + ":" + manifest[key].length);

  for (const [index, picture] of manifest[key].entries()) {
    const label = `${key}[${index}]`;
    assert.match(picture.file || "", new RegExp(`^years/pictures/${key}/[a-z0-9][a-z0-9-]*\\.webp$`), label + " has a canonical file path");
    assert.ok(Number.isInteger(picture.width) && picture.width > 0, label + " has a width");
    assert.ok(Number.isInteger(picture.height) && picture.height > 0, label + " has a height");
    assert.ok(Math.max(picture.width, picture.height) <= 1600, label + " is at most 1600px on its long side");
    assert.ok(String(picture.caption || "").trim().length > 20, label + " has a useful caption");
    assert.match(String(picture.caption || "").trim(), /[.!?]$/, label + " caption is a sentence");
    assert.ok(String(picture.event || "").trim(), label + " names its event");
    assert.ok(Object.hasOwn(picture, "date"), label + " records a date or null");
    if (picture.date != null && picture.date !== "") {
      assert.match(String(picture.date), new RegExp(`^${key}(?:-|$)`), label + " date belongs to its year");
    }
    assert.ok(String(picture.author || "").trim(), label + " credits an author");
    assert.ok(Object.hasOwn(picture, "credit"), label + " records the Commons Credit field or null");
    assert.match(String(picture.licence || ""), allowedLicence, label + " has an allowed licence");
    assert.ok(Object.hasOwn(picture, "licence_url"), label + " records the Commons licence URL or null");
    if (picture.licence_url != null) {
      assert.match(String(picture.licence_url), /^https:\/\//, label + " links the licence");
    } else {
      assert.equal(String(picture.licence).toLowerCase(), "public domain", label + " omits a URL only when Commons supplies none for public-domain status");
    }
    assert.match(String(picture.source_url || ""), /^https:\/\/commons\.wikimedia\.org\//, label + " links a Commons file page");
    assert.match(String(picture.original_url || ""), /^https:\/\/upload\.wikimedia\.org\//, label + " links the Commons original");
    assert.ok(!sourceUrls.has(picture.source_url), label + " does not repeat another photograph");
    sourceUrls.add(picture.source_url);

    const filePath = join(publicDir, picture.file);
    listedFiles.add(picture.file);
    assert.ok(existsSync(filePath), label + " file exists: " + picture.file);
    const dimensions = webpDimensions(filePath);
    assert.deepEqual(dimensions, { width: picture.width, height: picture.height }, label + " dimensions match its file");
    const bytes = statSync(filePath).size;
    totalBytes += bytes;
    totalPictures++;
    if (bytes > 180 * 1024) overTarget++;
  }
}

const actualFiles = [];
function collectFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(path);
    else actualFiles.push(path.slice(publicDir.length + 1).split("\\").join("/"));
  }
}
collectFiles(join(publicDir, "years", "pictures"));
assert.deepEqual(actualFiles.sort(), [...listedFiles].sort(), "pictures directory and manifest contain the same files");

console.log("pictures by year: " + counts.join(" "));
console.log(`pictures: ${totalPictures}; directory payload: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; over 180 KiB target: ${overTarget}`);
