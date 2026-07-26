import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount anything rendered by a test so DOM state doesn't leak between tests.
afterEach(() => {
  cleanup();
});
