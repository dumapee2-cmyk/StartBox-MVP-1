import { afterEach } from "vitest";

afterEach(() => {
  // Reset DOM between tests.
  document.body.innerHTML = "";
});
