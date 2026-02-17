const { test, expect } = require("@playwright/test");

async function focusEditor(page) {
  const cm = page.locator(".CodeMirror");
  if (await cm.count()) {
    await cm.first().click();
    return;
  }
  await page.locator("#editor").click();
}

async function clearEditor(page) {
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
}

async function getCode(page) {
  return page.evaluate(() => {
    if (window.fazide?.getCode) return String(window.fazide.getCode() || "");
    const node = document.querySelector("#editor");
    return String(node?.value || "");
  });
}

async function selectEditorRangeByIndex(page, start, end) {
  await page.evaluate(({ start, end }) => {
    const cmHost = document.querySelector(".CodeMirror");
    const cm = cmHost?.CodeMirror;
    if (cm && typeof cm.posFromIndex === "function") {
      const from = cm.posFromIndex(start);
      const to = cm.posFromIndex(end);
      cm.getDoc().setSelection(from, to);
      cm.focus();
      return;
    }
    const textarea = document.querySelector("#editor");
    if (textarea && typeof textarea.setSelectionRange === "function") {
      textarea.focus();
      textarea.setSelectionRange(start, end);
    }
  }, { start, end });
}

test("editor pro micro: typing open bracket inserts pair and keeps cursor inside", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("(");
  await page.keyboard.type("a");

  await expect.poll(() => getCode(page)).toBe("(a)");
});

test("editor pro micro: typing closing bracket at pair boundary skips duplicate", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("(");
  await page.keyboard.type(")");

  await expect.poll(() => getCode(page)).toBe("()");
});

test("editor pro micro: backspace between auto-pair removes both sides", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("[");
  await page.keyboard.press("Backspace");

  await expect.poll(() => getCode(page)).toBe("");
});

test("editor pro micro: typing opener with selection wraps selected code", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("index");
  });

  await selectEditorRangeByIndex(page, 1, 4);
  await page.keyboard.type("(");
  await page.keyboard.type("a");

  await expect.poll(() => getCode(page)).toBe("i(a)x");
});

test("editor pro micro: enter inside braces expands to indented block", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("{");
  await page.keyboard.press("Enter");
  await page.keyboard.type("x");

  await expect.poll(() => getCode(page)).toBe("{\n  x\n}");
});

test("editor pro micro: enter inside parentheses expands to multiline pair", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("(");
  await page.keyboard.press("Enter");
  await page.keyboard.type("arg");

  await expect.poll(() => getCode(page)).toBe("(\n  arg\n)");
});

test("editor pro micro: tab indents selected multi-line block", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("one\ntwo");
  });

  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Tab");

  await expect.poll(() => getCode(page)).toBe("  one\n  two");
});

test("editor pro micro: shift-tab outdents selected multi-line block", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("  one\n  two");
  });

  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");

  await expect.poll(() => getCode(page)).toBe("one\ntwo");
});

test("editor pro micro: completion opens for typed identifier prefix", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("con");

  await expect.poll(async () => {
    return page.evaluate(() => {
      const host = document.querySelector("#editorCompletion");
      const item = document.querySelector("#editorCompletionList [data-completion-index='0']");
      return host?.getAttribute("aria-hidden") === "false" && Boolean(item);
    });
  }).toBe(true);
});

test("editor pro micro: completion stays compact and anchored near typing line", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("con");

  await expect.poll(async () => {
    return page.evaluate(() => {
      const host = document.querySelector("#editorCompletion");
      const pane = document.querySelector(".editor-pane");
      if (!(host instanceof HTMLElement) || !(pane instanceof HTMLElement)) {
        return { ready: false };
      }
      if (host.getAttribute("aria-hidden") !== "false") {
        return { ready: false };
      }

      const hostRect = host.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      const cmHost = document.querySelector(".CodeMirror");
      const cm = cmHost?.CodeMirror;
      if (!cm || typeof cm.cursorCoords !== "function") {
        return {
          ready: true,
          hasCodeMirror: false,
          hostWidth: hostRect.width,
          paneWidth: paneRect.width,
        };
      }

      const coords = cm.cursorCoords(cm.getDoc().getCursor(), "page");
      const cursorYInPane = coords.bottom - paneRect.top;
      const panelYInPane = hostRect.top - paneRect.top;
      return {
        ready: true,
        hasCodeMirror: true,
        hostWidth: hostRect.width,
        paneWidth: paneRect.width,
        panelYInPane,
        cursorYInPane,
      };
    });
  }).toMatchObject({ ready: true });

  const result = await page.evaluate(() => {
    const host = document.querySelector("#editorCompletion");
    const pane = document.querySelector(".editor-pane");
    if (!(host instanceof HTMLElement) || !(pane instanceof HTMLElement)) {
      return { ready: false };
    }

    const hostRect = host.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const cmHost = document.querySelector(".CodeMirror");
    const cm = cmHost?.CodeMirror;
    if (!cm || typeof cm.cursorCoords !== "function") {
      return {
        ready: true,
        hasCodeMirror: false,
        hostWidth: hostRect.width,
        paneWidth: paneRect.width,
      };
    }

    const coords = cm.cursorCoords(cm.getDoc().getCursor(), "page");
    return {
      ready: true,
      hasCodeMirror: true,
      hostWidth: hostRect.width,
      paneWidth: paneRect.width,
      panelYInPane: hostRect.top - paneRect.top,
      cursorYInPane: coords.bottom - paneRect.top,
    };
  });

  expect(result.hostWidth).toBeLessThan(result.paneWidth - 24);
  expect(result.hostWidth).toBeLessThanOrEqual(420);

  if (result.hasCodeMirror) {
    expect(Math.abs(result.panelYInPane - result.cursorYInPane)).toBeLessThanOrEqual(260);
  }
});

test("editor pro micro: completion items render semantic kind icons", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.([
      "function tick(delta) {",
      "  return delta + 1;",
      "}",
      "const tempo = 120;",
      "",
    ].join("\n"));
  });

  await focusEditor(page);
  await page.keyboard.type("ti");

  await expect.poll(async () => {
    return page.evaluate(() => {
      const host = document.querySelector("#editorCompletion");
      if (host?.getAttribute("aria-hidden") !== "false") {
        return { ready: false };
      }
      const rows = Array.from(document.querySelectorAll("#editorCompletionList .editor-completion-item"));
      if (!rows.length) return { ready: false };
      const kinds = rows.map((row) => String(row.getAttribute("data-completion-kind") || "").trim()).filter(Boolean);
      const iconSvgCount = rows.reduce((count, row) => count + (row.querySelector(".editor-completion-item-icon svg") ? 1 : 0), 0);
      return {
        ready: true,
        rowCount: rows.length,
        kinds,
        iconSvgCount,
      };
    });
  }).toMatchObject({ ready: true });

  const result = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#editorCompletionList .editor-completion-item"));
    const kinds = rows.map((row) => String(row.getAttribute("data-completion-kind") || "").trim()).filter(Boolean);
    const iconSvgCount = rows.reduce((count, row) => count + (row.querySelector(".editor-completion-item-icon svg") ? 1 : 0), 0);
    return {
      rowCount: rows.length,
      kinds,
      iconSvgCount,
    };
  });

  expect(result.rowCount).toBeGreaterThan(0);
  expect(result.iconSvgCount).toBeGreaterThan(0);
  expect(result.kinds.some((kind) => ["function", "method", "arrow", "variable", "keyword", "snippet"].includes(kind))).toBeTruthy();
});

test("editor pro micro: inline ghost text previews active completion suffix", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("con");

  await expect.poll(async () => {
    return page.evaluate(() => {
      const cmHost = document.querySelector(".CodeMirror");
      if (!cmHost) {
        return { hasCodeMirror: false, ghostText: "" };
      }
      const ghost = cmHost.querySelector(".editor-inline-ghost");
      return {
        hasCodeMirror: true,
        ghostText: String(ghost?.textContent || "").trim(),
      };
    });
  }).toEqual(expect.objectContaining({ hasCodeMirror: expect.any(Boolean), ghostText: expect.any(String) }));

  const result = await page.evaluate(() => {
    const cmHost = document.querySelector(".CodeMirror");
    if (!cmHost) {
      return { hasCodeMirror: false, ghostText: "" };
    }
    const ghost = cmHost.querySelector(".editor-inline-ghost");
    return {
      hasCodeMirror: true,
      ghostText: String(ghost?.textContent || "").trim(),
    };
  });

  if (result.hasCodeMirror) {
    expect(result.ghostText).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
  }
});

test("editor pro micro: tab accepts active completion candidate", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("con");
  await expect.poll(async () => {
    return page.evaluate(() => document.querySelector("#editorCompletion")?.getAttribute("aria-hidden"));
  }).toBe("false");

  await page.keyboard.press("Tab");

  await expect.poll(() => getCode(page)).toBe("const");
  await expect.poll(async () => {
    return page.evaluate(() => document.querySelector("#editorCompletion")?.getAttribute("aria-hidden"));
  }).toBe("true");
});

test("editor pro micro: escape closes completion without committing", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await clearEditor(page);
  await page.keyboard.type("con");
  await expect.poll(async () => {
    return page.evaluate(() => document.querySelector("#editorCompletion")?.getAttribute("aria-hidden"));
  }).toBe("false");

  await page.keyboard.press("Escape");
  await page.keyboard.type("x");

  await expect.poll(() => getCode(page)).toBe("conx");
  await expect.poll(async () => {
    return page.evaluate(() => {
      const hostState = document.querySelector("#editorCompletion")?.getAttribute("aria-hidden") || "";
      const ghost = document.querySelector(".CodeMirror .editor-inline-ghost");
      return hostState === "true" && !ghost;
    });
  }).toBe(true);
});

test("editor pro micro: inline parameter hint tracks active argument", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const setup = await page.evaluate(async () => {
    const api = window.fazide;
    const cmHost = document.querySelector(".CodeMirror");
    const cm = cmHost?.CodeMirror;
    if (!api?.setCode || !cm) return { ready: false };

    const code = [
      "function sum(a, b, c) {",
      "  return a + b + c;",
      "}",
      "",
      "sum(",
    ].join("\n");

    api.setCode(code);
    const doc = cm.getDoc();
    doc.setCursor({ line: 4, ch: 4 });
    cm.focus();
    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    return {
      ready: true,
    };
  });

  expect(setup.ready).toBeTruthy();

  await expect.poll(async () => {
    return page.evaluate(() => {
      const hint = document.querySelector("#editorSignatureHint");
      return {
        visible: hint?.getAttribute("data-visible") === "true",
        active: hint?.getAttribute("data-active-param") || "",
      };
    });
  }).toEqual({ visible: true, active: "0" });

  await page.evaluate(async () => {
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (!cm) return;
    cm.getDoc().replaceSelection("1, ");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  await expect.poll(async () => {
    return page.evaluate(() => document.querySelector("#editorSignatureHint")?.getAttribute("data-active-param") || "");
  }).toBe("1");

  await page.evaluate(async () => {
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (!cm) return;
    cm.getDoc().replaceSelection("2, ");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const hint = document.querySelector("#editorSignatureHint");
      return {
        active: hint?.getAttribute("data-active-param") || "",
        text: String(hint?.textContent || "").toLowerCase(),
      };
    });
  }).toEqual(expect.objectContaining({ active: "2" }));

  const hintText = await page.evaluate(() => String(document.querySelector("#editorSignatureHint")?.textContent || "").toLowerCase());
  expect(hintText).toContain("sum");
});

test("editor pro micro: settings tune completion transparency and max items", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const openSettingsBtn = document.querySelector("#editorSettingsBtn");
    const opacityInput = document.querySelector("#editorCompletionOpacity");
    const maxItemsInput = document.querySelector("#editorCompletionMaxItems");
    const api = window.fazide;
    if (!(openSettingsBtn instanceof HTMLElement) || !(opacityInput instanceof HTMLInputElement) || !(maxItemsInput instanceof HTMLInputElement) || !api?.setCode) {
      return { ready: false };
    }

    openSettingsBtn.click();
    opacityInput.value = "35";
    opacityInput.dispatchEvent(new Event("input", { bubbles: true }));
    opacityInput.dispatchEvent(new Event("change", { bubbles: true }));
    maxItemsInput.value = "4";
    maxItemsInput.dispatchEvent(new Event("change", { bubbles: true }));

    const cmHost = document.querySelector(".CodeMirror");
    const cm = cmHost?.CodeMirror;
    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    api.setCode("con");
    if (cm) {
      cm.getDoc().setCursor({ line: 0, ch: 3 });
      cm.focus();
    }
    await waitForPaint();
    await waitForPaint();

    const completion = document.querySelector("#editorCompletion");
    const items = document.querySelectorAll("#editorCompletionList [data-completion-index]");
    const alpha = completion instanceof HTMLElement
      ? String(completion.style.getPropertyValue("--editor-completion-alpha") || "").trim()
      : "";

    return {
      ready: true,
      alpha,
      itemCount: items.length,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.alpha).toBe("0.35");
  expect(result.itemCount).toBeLessThanOrEqual(4);
});
