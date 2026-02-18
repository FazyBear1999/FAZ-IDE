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

async function gotoWithTextareaFallback(page) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, "CodeMirror", {
        configurable: true,
        get() {
          return undefined;
        },
        set() {
          return true;
        },
      });
    } catch {
      // no-op
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => {
    return page.evaluate(() => ({
      hasCodeMirror: Boolean(document.querySelector(".CodeMirror")),
      hasTextarea: Boolean(document.querySelector("#editor")),
    }));
  }).toEqual({ hasCodeMirror: false, hasTextarea: true });
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

test("editor pro micro: typing > after html opening tag inserts matching closing tag", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-auto-close-${Date.now().toString(36)}.html`, "");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await clearEditor(page);
  await page.keyboard.type("<html>");
  await page.keyboard.type("x");

  await expect.poll(() => getCode(page)).toBe("<html>x</html>");
});

test("editor pro micro: typing > on void html tag does not add closing tag", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-auto-close-void-${Date.now().toString(36)}.html`, "");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await clearEditor(page);
  await page.keyboard.type("<input>");

  await expect.poll(() => getCode(page)).toBe("<input>");
});

test("editor pro micro: typing / after < completes nearest html closing tag", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-close-complete-${Date.now().toString(36)}.html`, "");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await clearEditor(page);
  await page.keyboard.type("<main>Hi<");
  await page.keyboard.type("/");

  await expect.poll(() => getCode(page)).toBe("<main>Hi</main>");
});

test("editor pro micro: typing / after < does not force close tag without open context", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-close-complete-none-${Date.now().toString(36)}.html`, "");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await clearEditor(page);
  await page.keyboard.type("<");
  await page.keyboard.type("/");

  await expect.poll(() => getCode(page)).toBe("</");
});

test("editor pro micro: html close-tag completion stays disabled inside script content", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const scriptCode = [
    "<script>",
    "const tpl = \"<div<\";",
    "</script>",
    "",
  ].join("\n");

  const created = await page.evaluate((code) => {
    const api = window.fazide;
    if (!api?.createFile || !api?.setCode) return false;
    const file = api.createFile(`editor-close-script-safe-${Date.now().toString(36)}.html`, code);
    if (!file?.id) return false;
    api.setCode(code);
    return true;
  }, scriptCode);
  expect(created).toBeTruthy();

  const cursorIndex = scriptCode.indexOf("<div<") + "<div<".length;
  await selectEditorRangeByIndex(page, cursorIndex, cursorIndex);
  await page.keyboard.type("/");

  await expect.poll(() => getCode(page)).toContain("<div</");
});

test("editor pro micro: html auto-close stays disabled inside html comments", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-autoclose-comment-safe-${Date.now().toString(36)}.html`, "");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await clearEditor(page);
  await page.keyboard.type("<!-- <panel");
  await page.keyboard.type(">");

  await expect.poll(() => getCode(page)).toBe("<!-- <panel>");
});

test("editor pro micro: renaming html opening tag syncs paired closing tag", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-paired-rename-${Date.now().toString(36)}.html`, "<section>Card</section>");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await selectEditorRangeByIndex(page, 1, 8);
  await page.keyboard.type("article");

  await expect.poll(() => getCode(page)).toBe("<article>Card</article>");
});

test("editor pro micro: enter between html tags creates indented middle line", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-html-enter-${Date.now().toString(36)}.html`, "");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await clearEditor(page);
  await page.keyboard.type("<div>");
  await page.keyboard.press("Enter");
  await page.keyboard.type("x");

  await expect.poll(() => getCode(page)).toBe("<div>\n  x\n</div>");
});

test("editor pro micro: enter between angle brackets in js does not force html block expand", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-html-enter-safe-${Date.now().toString(36)}.js`, "const view = '<div></div>';\n");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await page.evaluate(() => {
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (!cm) return;
    const doc = cm.getDoc();
    const text = doc.getValue();
    const marker = "<div></div>";
    const idx = text.indexOf(marker);
    if (idx < 0) return;
    const cursorIdx = idx + "<div>".length;
    doc.setCursor(doc.posFromIndex(cursorIdx));
    cm.focus();
  });

  await page.keyboard.press("Enter");

  await expect.poll(() => getCode(page)).toContain("<div>\n</div>");
});

test("editor pro micro: alt+shift+arrowdown duplicates current line", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("alpha\nbeta");
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      cm.getDoc().setCursor({ line: 0, ch: 2 });
      cm.focus();
    }
  });

  await page.keyboard.press("Alt+Shift+ArrowDown");

  await expect.poll(() => getCode(page)).toBe("alpha\nalpha\nbeta");
});

test("editor pro micro: alt+shift+arrowdown duplicates selected block", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("one\ntwo\nthree");
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      const doc = cm.getDoc();
      doc.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 3 });
      cm.focus();
    }
  });

  await page.keyboard.press("Alt+Shift+ArrowDown");

  await expect.poll(() => getCode(page)).toBe("one\ntwo\none\ntwo\nthree");
});

test("editor pro micro: alt+shift+arrowup duplicates current line upward", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("alpha\nbeta\ngamma");
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      cm.getDoc().setCursor({ line: 1, ch: 1 });
      cm.focus();
    }
  });

  await page.keyboard.press("Alt+Shift+ArrowUp");

  await expect.poll(() => getCode(page)).toBe("alpha\nbeta\nbeta\ngamma");
});

test("editor pro micro: alt+arrow moves line down then up", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("first\nsecond\nthird");
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      cm.getDoc().setCursor({ line: 1, ch: 2 });
      cm.focus();
    }
  });

  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => getCode(page)).toBe("first\nthird\nsecond");

  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => getCode(page)).toBe("first\nsecond\nthird");
});

test("editor pro micro: ctrl/cmd+/ toggles javascript line comments", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-comment-js-${Date.now().toString(36)}.js`, "const value = 1;");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+/");
  await expect.poll(() => getCode(page)).toBe("// const value = 1;");

  await page.keyboard.press("ControlOrMeta+/");
  await expect.poll(() => getCode(page)).toBe("const value = 1;");
});

test("editor pro micro: ctrl/cmd+/ toggles html comments with wrappers", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const created = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFile) return false;
    const file = api.createFile(`editor-comment-html-${Date.now().toString(36)}.html`, "<div>Card</div>");
    return Boolean(file?.id);
  });
  expect(created).toBeTruthy();

  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+/");
  await expect.poll(() => getCode(page)).toBe("<!-- <div>Card</div> -->");

  await page.keyboard.press("ControlOrMeta+/");
  await expect.poll(() => getCode(page)).toBe("<div>Card</div>");
});

test("editor pro micro: ctrl/cmd+shift+k deletes current line", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("one\ntwo\nthree");
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      cm.getDoc().setCursor({ line: 1, ch: 1 });
      cm.focus();
      return;
    }
    const textarea = document.querySelector("#editor");
    if (textarea instanceof HTMLTextAreaElement) {
      const start = textarea.value.indexOf("two");
      textarea.focus();
      textarea.setSelectionRange(start, start);
    }
  });

  await page.keyboard.press("ControlOrMeta+Shift+K");

  await expect.poll(() => getCode(page)).toBe("one\nthree");
});

test("editor pro micro: ctrl/cmd+shift+k deletes selected block", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("zero\none\ntwo\nthree");
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      const doc = cm.getDoc();
      doc.setSelection({ line: 1, ch: 0 }, { line: 2, ch: 3 });
      cm.focus();
      return;
    }
    const textarea = document.querySelector("#editor");
    if (textarea instanceof HTMLTextAreaElement) {
      const from = textarea.value.indexOf("one");
      const to = textarea.value.indexOf("three") - 1;
      textarea.focus();
      textarea.setSelectionRange(from, to);
    }
  });

  await page.keyboard.press("ControlOrMeta+Shift+K");

  await expect.poll(() => getCode(page)).toBe("zero\nthree");
});

test("editor pro micro: ctrl/cmd+d selects next occurrence deterministically", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("const item = 1;\nitem += 2;\nitem += 3;");
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      cm.getDoc().setCursor({ line: 0, ch: 7 });
      cm.focus();
    }
  });

  await page.keyboard.press("ControlOrMeta+D");
  await page.keyboard.press("ControlOrMeta+D");
  await page.keyboard.press("ControlOrMeta+D");

  await expect.poll(async () => {
    return page.evaluate(() => {
      const cm = document.querySelector(".CodeMirror")?.CodeMirror;
      if (!cm) return { supported: false, count: 0, words: [] };
      const doc = cm.getDoc();
      const words = doc.listSelections().map((sel) => doc.getRange(sel.from(), sel.to()));
      return {
        supported: true,
        count: words.length,
        words,
      };
    });
  }).toEqual({
    supported: true,
    count: 3,
    words: ["item", "item", "item"],
  });
});

test("editor pro micro: ctrl/cmd+shift+l selects all occurrences in active file", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setCode?.("const item = 1;\nitem += 2;\nitem += 3;");
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      cm.getDoc().setCursor({ line: 0, ch: 7 });
      cm.focus();
    }
  });

  await page.keyboard.press("ControlOrMeta+Shift+L");

  await expect.poll(async () => {
    return page.evaluate(() => {
      const cm = document.querySelector(".CodeMirror")?.CodeMirror;
      if (!cm) return { supported: false, count: 0, words: [] };
      const doc = cm.getDoc();
      const words = doc.listSelections().map((sel) => doc.getRange(sel.from(), sel.to()));
      return {
        supported: true,
        count: words.length,
        words,
      };
    });
  }).toEqual({
    supported: true,
    count: 3,
    words: ["item", "item", "item"],
  });
});

test("editor pro micro: textarea fallback preserves duplicate/move/comment/delete shortcuts", async ({ page }) => {
  await gotoWithTextareaFallback(page);

  await page.evaluate(() => {
    window.fazide?.setCode?.("alpha\nbeta");
    const textarea = document.querySelector("#editor");
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const start = textarea.value.indexOf("alpha") + 2;
    textarea.focus();
    textarea.setSelectionRange(start, start);
  });
  await page.keyboard.press("Alt+Shift+ArrowDown");
  await expect.poll(() => getCode(page)).toBe("alpha\nalpha\nbeta");

  await page.evaluate(() => {
    window.fazide?.setCode?.("first\nsecond\nthird");
    const textarea = document.querySelector("#editor");
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const start = textarea.value.indexOf("second") + 2;
    textarea.focus();
    textarea.setSelectionRange(start, start);
  });
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => getCode(page)).toBe("second\nfirst\nthird");

  await page.evaluate(() => {
    window.fazide?.setCode?.("const value = 1;");
    const textarea = document.querySelector("#editor");
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    textarea.focus();
    textarea.setSelectionRange(0, 0);
  });
  await page.keyboard.press("ControlOrMeta+/");
  await expect.poll(() => getCode(page)).toBe("// const value = 1;");

  await page.evaluate(() => {
    window.fazide?.setCode?.("one\ntwo");
    const textarea = document.querySelector("#editor");
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const start = textarea.value.indexOf("one");
    textarea.focus();
    textarea.setSelectionRange(start, start);
  });
  await page.keyboard.press("ControlOrMeta+Shift+K");
  await expect.poll(() => getCode(page)).toBe("two");
});

test("editor pro micro: textarea fallback ctrl/cmd+d selects next occurrence sequentially", async ({ page }) => {
  await gotoWithTextareaFallback(page);

  const source = "item one\nitem two\nitem three";
  await page.evaluate((value) => {
    window.fazide?.setCode?.(value);
    const textarea = document.querySelector("#editor");
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    textarea.focus();
    textarea.setSelectionRange(0, 4);
  }, source);

  await page.keyboard.press("ControlOrMeta+D");
  let selection = await page.evaluate(() => {
    const textarea = document.querySelector("#editor");
    if (!(textarea instanceof HTMLTextAreaElement)) return { text: "", start: -1 };
    return {
      text: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
      start: textarea.selectionStart,
    };
  });
  expect(selection.text).toBe("item");
  expect(selection.start).toBe(source.indexOf("item", 1));

  await page.keyboard.press("ControlOrMeta+D");
  selection = await page.evaluate(() => {
    const textarea = document.querySelector("#editor");
    if (!(textarea instanceof HTMLTextAreaElement)) return { text: "", start: -1 };
    return {
      text: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
      start: textarea.selectionStart,
    };
  });
  expect(selection.text).toBe("item");
  expect(selection.start).toBe(source.lastIndexOf("item"));
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
