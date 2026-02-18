const { test, expect } = require("@playwright/test");

test("workspace preview module sanitizes css preview style escapes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const { buildCssPreviewHtml } = await import("/assets/js/sandbox/workspacePreview.js");
    const html = buildCssPreviewHtml("body{color:red;} </style><script>window.__xss=true</script>");
    return {
      hasEscapedCloseStyle: html.includes("<\\/style><script>"),
      hasCssPreviewTitle: html.includes("CSS Preview"),
    };
  });

  expect(result.hasEscapedCloseStyle).toBeTruthy();
  expect(result.hasCssPreviewTitle).toBeTruthy();
});

test("workspace resolver inlines local css and javascript assets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const { createWorkspaceAssetResolver } = await import("/assets/js/sandbox/workspacePreview.js");
    const files = [
      { name: "apps/demo/index.html", code: '<!doctype html><html><head><link rel="stylesheet" href="./styles.css" /></head><body><script src="./main.js" defer></script></body></html>' },
      { name: "apps/demo/styles.css", code: "body{background:#111;}" },
      { name: "apps/demo/main.js", code: "window.__workspaceInline=true;" },
    ];
    const resolver = createWorkspaceAssetResolver(files);
    const output = resolver.buildHtmlFromWorkspace(files[0].code, files[0].name);
    return {
      cssInlined: output.includes('data-fazide-source="apps/demo/styles.css"'),
      jsInlined: output.includes('data-fazide-source="apps/demo/main.js"'),
      srcRemovedFromInlineScript: /<script[^>]*data-fazide-source="apps\/demo\/main.js"[^>]*>([\s\S]*?)<\/script>/.test(output) && !/<script[^>]*data-fazide-source="apps\/demo\/main.js"[^>]*src=/.test(output),
    };
  });

  expect(result.cssInlined).toBeTruthy();
  expect(result.jsInlined).toBeTruthy();
  expect(result.srcRemovedFromInlineScript).toBeTruthy();
});
