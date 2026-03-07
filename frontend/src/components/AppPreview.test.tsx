import { describe, expect, it } from "vitest";
import { buildIframeHtml } from "./AppPreview";

describe("AppPreview iframe runtime", () => {
  it("keeps runtime dependencies and omits forced global theme/font/layout blocks", () => {
    const html = buildIframeHtml("function App(){return <div>Hello</div>}", "app-1", false);

    expect(html).toContain("react.production.min.js");
    expect(html).toContain("react-dom.production.min.js");
    expect(html).toContain("babel.min.js");
    expect(html).toContain("window.__sb");

    expect(html).not.toContain("font-family: system-ui");
    expect(html).not.toContain(".sb-card");
    expect(html).not.toContain(".glass-elevated");
    expect(html).not.toContain("max-width: 1200px");
  });

  it("does not include runtime mobile width-mutation scripts", () => {
    const html = buildIframeHtml("function App(){return <div>Hello</div>}", "app-2", true);

    expect(html).toContain("-webkit-text-size-adjust");
    expect(html).not.toContain("scrollWidth");
    expect(html).not.toContain("clientWidth");
    expect(html).not.toContain("overflowX");
    expect(html).not.toContain("element.style.width");
  });
});
