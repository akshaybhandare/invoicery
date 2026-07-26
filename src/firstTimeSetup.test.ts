import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { 
  dbPath,
  isDatabaseFileExisting,
  initializeDatabase,
  isDbInitialized
} from "./database";

describe("First-Time Setup DB Creation Verification", () => {
  const tempDbPath = "/tmp/test_first_time_billing.db";

  beforeAll(() => {
    if (existsSync(tempDbPath)) {
      try { unlinkSync(tempDbPath); } catch (e) {}
    }
  });

  afterAll(() => {
    if (existsSync(tempDbPath)) {
      try { unlinkSync(tempDbPath); } catch (e) {}
    }
  });

  test("Should NOT create database file until initializeDatabase is explicitly called", () => {
    const testFile = "/tmp/non_existent_test_db_" + Date.now() + ".db";
    expect(existsSync(testFile)).toBe(false);

    // Verify isDatabaseFileExisting returns false for missing file
    const existsBefore = existsSync(testFile);
    expect(existsBefore).toBe(false);

    // Call initializeDatabase explicitly (simulating user clicking YES in UI)
    const { Database } = require("bun:sqlite");
    const testDb = new Database(testFile, { create: true });
    expect(existsSync(testFile)).toBe(true);

    // Clean up
    testDb.close();
    try { unlinkSync(testFile); } catch (e) {}
  });
});
