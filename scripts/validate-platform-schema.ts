#!/usr/bin/env bun
/**
 * Validates platform-catalog.json against the shared JSON Schema.
 * Catches drift between TypeScript types and the schema contract.
 */
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020";

const SCHEMA_PATH = path.join(import.meta.dir, "..", "schemas", "platform-types.schema.json");
const CATALOG_PATH = path.join(import.meta.dir, "..", "platforms", "platform-catalog.json");

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as { platforms: unknown[] };

const ajv = new Ajv({ allErrors: true });

// Validate the catalog against the PlatformCatalog definition
const catalogSchema = {
  ...schema,
  $ref: "#/$defs/PlatformCatalog",
};

const validate = ajv.compile(catalogSchema);
const valid = validate(catalog);

if (!valid) {
  console.error("Platform catalog validation failed:");
  for (const error of validate.errors ?? []) {
    console.error(`  ${error.instancePath || "/"}: ${error.message}`);
  }
  process.exit(1);
}

console.log(`Platform catalog is valid (${catalog.platforms.length} platforms).`);
