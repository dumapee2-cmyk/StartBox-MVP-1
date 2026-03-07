import { describe, expect, it } from "vitest";
import { cleanGeneratedCode } from "./codeGenerator.js";

const LUCIDE_DECLARATION_REGEX = /(const|let|var)\s*\{([^}]*)\}\s*=\s*window\.(LucideReact|lucideReact)\s*\|\|\s*\{\}\s*;?/;

describe("cleanGeneratedCode icon reconciliation", () => {
  it("appends missing icon refs when Lucide destructuring already exists", () => {
    const raw = `
      const {Home} = window.LucideReact || {};
      function App() {
        return <div><ArrowLeft className="w-4 h-4" /><Home className="w-4 h-4" /></div>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<App />);
    `;

    const cleaned = cleanGeneratedCode(raw);
    const match = cleaned.match(LUCIDE_DECLARATION_REGEX);
    expect(match).not.toBeNull();
    expect(match?.[2]).toContain("Home");
    expect(match?.[2]).toContain("ArrowLeft");
    expect((match?.[2].match(/\bArrowLeft\b/g) || []).length).toBe(1);
  });

  it("does not add native SVG elements to Lucide destructuring", () => {
    const raw = `
      function App() {
        return (
          <div>
            <svg viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="30" />
            </svg>
            <ArrowLeft className="w-4 h-4" />
          </div>
        );
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<App />);
    `;

    const cleaned = cleanGeneratedCode(raw);
    const match = cleaned.match(LUCIDE_DECLARATION_REGEX);
    expect(match).not.toBeNull();
    expect(match?.[2]).toContain("ArrowLeft");
    expect(match?.[2]).not.toContain("Circle");
  });

  it("reconciles Image icon refs as Lucide icons", () => {
    const raw = `
      const {Home} = window.LucideReact || {};
      function App() {
        return <div><Image className="w-4 h-4" /><Home className="w-4 h-4" /></div>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<App />);
    `;

    const cleaned = cleanGeneratedCode(raw);
    const match = cleaned.match(LUCIDE_DECLARATION_REGEX);
    expect(match).not.toBeNull();
    expect(match?.[2]).toContain("Image");
    expect((match?.[2].match(/\bImage\b/g) || []).length).toBe(1);
  });

  it("handles lowercase lucide alias and missing semicolon without duplicating declarations", () => {
    const raw = `
      const { Home } = window.lucideReact || {}
      function App() {
        return <div><ArrowLeft className="w-4 h-4" /><Home className="w-4 h-4" /></div>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<App />);
    `;

    const cleaned = cleanGeneratedCode(raw);
    const matches = cleaned.match(new RegExp(LUCIDE_DECLARATION_REGEX.source, "g")) || [];
    const match = cleaned.match(LUCIDE_DECLARATION_REGEX);

    expect(matches.length).toBe(1);
    expect(match).not.toBeNull();
    expect(match?.[3]).toBe("lucideReact");
    expect(match?.[2]).toContain("Home");
    expect(match?.[2]).toContain("ArrowLeft");
  });
});
