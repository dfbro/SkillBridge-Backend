import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getOpenApiDocument } from "../src/app";

const output = resolve("docs/openapi.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(getOpenApiDocument(), null, 2)}\n`);
process.stdout.write(`OpenAPI document exported to ${output}\n`);
