import { describe, it, expect } from "bun:test";
import {
  listTenantFiles,
  saveTenantFile,
  detectFileLang,
} from "../src/lib/server/tenant-files";
import {
  getStudioChatHistory,
  saveStudioChatMessage,
  clearStudioChatHistory,
} from "../src/lib/server/db";

describe("Tenant Files System", () => {
  it("should detect languages properly", () => {
    expect(detectFileLang("+page.svelte")).toBe("html");
    expect(detectFileLang("server.ts")).toBe("typescript");
    expect(detectFileLang("package.json")).toBe("json");
  });

  it("should list tenant files for tester", () => {
    const files = listTenantFiles("tester");
    expect(files).toBeDefined();
    expect(typeof files).toBe("object");
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });

  it("should save and read tenant file safely", () => {
    const testPath = "src/routes/test-temp.svelte";
    const content = "<p>Test File</p>";
    saveTenantFile("tester", testPath, content);

    const files = listTenantFiles("tester");
    expect(files[testPath]).toBeDefined();
    expect(files[testPath].content).toBe(content);

    // Clean up
    const fs = require("fs");
    const path = require("path");
    const { getTenantCodeDir } = require("../src/lib/server/tenant-files");
    const full = path.join(getTenantCodeDir("tester"), testPath);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
    }
  });

  it("should block path traversal attempts", () => {
    expect(() => {
      saveTenantFile("tester", "../../etc/passwd", "hack");
    }).toThrow();
  });

  it("should classify files correctly and prevent binary overwrite", () => {
    const { getFileCategory, isBinaryFile } = require("../src/lib/utils/file-types");

    expect(getFileCategory("data.db")).toBe("sqlite");
    expect(getFileCategory("store.sqlite3")).toBe("sqlite");
    expect(getFileCategory("avatar.png")).toBe("image");
    expect(getFileCategory("hero.webp")).toBe("image");
    expect(getFileCategory("icon.svg")).toBe("image");
    expect(getFileCategory("font.woff2")).toBe("binary");
    expect(getFileCategory("module.wasm")).toBe("binary");
    expect(getFileCategory("+page.svelte")).toBe("code");
    expect(getFileCategory("index.ts")).toBe("code");

    expect(isBinaryFile("data.db")).toBe(true);
    expect(isBinaryFile("avatar.png")).toBe(true);
    expect(isBinaryFile("font.woff2")).toBe(true);
    expect(isBinaryFile("icon.svg")).toBe(false); // SVG is text-editable
    expect(isBinaryFile("+page.svelte")).toBe(false);

    expect(() => {
      saveTenantFile("tester", "data.db", "corrupt binary data");
    }).toThrow("Impossible d'écraser un fichier binaire");

    expect(() => {
      saveTenantFile("tester", "static/uploads/image.png", "not an image");
    }).toThrow("Impossible d'écraser un fichier binaire");
  });
});

describe("Studio Chat History Persistence", () => {
  const testTenant = "test_tenant_vitest";

  it("should save, retrieve and clear chat history in SQLite", () => {
    clearStudioChatHistory(testTenant);

    saveStudioChatMessage(
      testTenant,
      "user",
      "Ajoute un bouton rouge",
      "auto",
      "conv_abc",
    );
    saveStudioChatMessage(
      testTenant,
      "assistant",
      "Bouton rouge ajouté avec succès.",
      "primary",
      "conv_abc",
      [{ id: 1, name: "Mise à jour de +page.svelte", state: "completed" }],
    );

    const history = getStudioChatHistory(testTenant);
    expect(history.length).toBe(2);
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("Ajoute un bouton rouge");
    expect(history[0].conversationId).toBe("conv_abc");

    expect(history[1].role).toBe("assistant");
    expect(history[1].content).toBe("Bouton rouge ajouté avec succès.");
    expect(history[1].steps).toBeDefined();
    expect(history[1].steps?.length).toBe(1);
    expect(history[1].steps?.[0].name).toBe("Mise à jour de +page.svelte");

    clearStudioChatHistory(testTenant);
    const afterClear = getStudioChatHistory(testTenant);
    expect(afterClear.length).toBe(0);
  });

  it("should persist and retrieve attached image URLs in chat history", () => {
    clearStudioChatHistory(testTenant);

    saveStudioChatMessage(
      testTenant,
      "user",
      "Voici la maquette à intégrer",
      "auto",
      "conv_img",
      undefined,
      "/uploads/mockup_123.png",
    );

    const history = getStudioChatHistory(testTenant);
    expect(history.length).toBe(1);
    expect(history[0].role).toBe("user");
    expect(history[0].imageUrl).toBe("/uploads/mockup_123.png");

    clearStudioChatHistory(testTenant);
  });
});
