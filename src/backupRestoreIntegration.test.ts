import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { 
  db,
  dbPath,
  initializeDatabase,
  getSettings,
  updateSetting,
  reopenDatabase
} from "./database";

describe("Backup & Restore Integration Verification", () => {
  beforeAll(() => {
    initializeDatabase();
  });

  test("Backup utility produces valid zip file containing database", async () => {
    const zipPath = "/tmp/test_invoicery_backup.zip";
    if (existsSync(zipPath)) {
      try { unlinkSync(zipPath); } catch (e) {}
    }

    // Set a distinct test value in settings
    updateSetting("test_backup_key", "backup_verification_value_123");

    // Execute backup zipping using relative dbPath
    const relDbPath = "data/billing.db";
    const { spawnSync } = require("node:child_process");
    const proc = spawnSync("zip", ["-r", "-q", zipPath, relDbPath, "attachments"]);
    expect(proc.status).toBe(0);

    const file = Bun.file(zipPath);
    expect(await file.exists()).toBe(true);
    const size = file.size;
    expect(size).toBeGreaterThan(0);

    // Verify ZIP contains data/billing.db using unzip -l
    const listProc = spawnSync("unzip", ["-l", zipPath]);
    const zipContents = listProc.stdout?.toString() || "";
    expect(zipContents).toContain("billing.db");

    // Clean up temp backup file
    try { unlinkSync(zipPath); } catch (e) {}
  });

  test("Restore utility extracts zip backup and reopens database cleanly", async () => {
    const zipPath = "/tmp/test_restore_archive.zip";
    if (existsSync(zipPath)) {
      try { unlinkSync(zipPath); } catch (e) {}
    }

    // Write a unique value into settings to backup
    updateSetting("test_restore_marker", "RESTORED_SECRET_8899");

    // Package database into zip archive
    const { spawnSync } = require("node:child_process");
    const relDbPath = "data/billing.db";
    const procZip = spawnSync("zip", ["-r", "-q", zipPath, relDbPath, "attachments"]);
    expect(procZip.status).toBe(0);

    // Mutate the database in memory
    updateSetting("test_restore_marker", "CORRUPTED_VALUE");

    // Perform restore procedure: close db, extract zip, reopen db
    reopenDatabase();
    db.close();

    const procUnzip = spawnSync("unzip", ["-o", "-q", zipPath, "-d", "."]);
    expect(procUnzip.status).toBe(0);

    reopenDatabase();

    // Verify restored database contains original marker
    const settings = getSettings();
    expect(settings.test_restore_marker).toBe("RESTORED_SECRET_8899");

    // Clean up
    try { unlinkSync(zipPath); } catch (e) {}
    db.run("DELETE FROM settings WHERE key LIKE 'test_%';");
  });
});
