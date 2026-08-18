import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("demo bind and secrets", () => {
  it("binds published compose ports to 127.0.0.1", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    expect(compose).toMatch(/127\.0\.0\.1:3010:3010/);
    expect(compose).toMatch(/127\.0\.0\.1:5433:5432/);
    expect(compose).toMatch(/LLM_BASE_URL: http:\/\/127\.0\.0\.1:8088\/v1/);
    expect(compose).toMatch(/network_mode: host/);
    expect(compose).toMatch(/gpu-container/);
    expect(compose).not.toMatch(/^\s+-\s+"3010:3010"/m);
  });

  it("binds next dev to localhost so the pilot is not on the LAN", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toMatch(/-H 127\.0\.0\.1/);
    expect(pkg.scripts.dev).toMatch(/-p 3010/);
    expect(pkg.scripts.up).toMatch(/scripts\/up\.sh/);
    expect(pkg.scripts.down).toMatch(/scripts\/down\.sh/);
  });

  it("starts host llama plus db/web/worker and never brings up the llm container", () => {
    const up = readFileSync("scripts/up.sh", "utf8");
    const down = readFileSync("scripts/down.sh", "utf8");
    expect(up).toMatch(/docker compose up -d db web worker/);
    expect(up).toMatch(/docker compose build web worker/);
    expect(up).not.toMatch(/docker compose up[^\n]*\bllm\b/);
    expect(up).not.toMatch(/docker compose build[^\n]*\bllm\b/);
    expect(down).toMatch(/docker compose stop db web worker/);
    expect(down).not.toMatch(/docker compose down/);
    expect(up).toMatch(/llama-tmux\.sh/);
    expect(down).toMatch(/llama-tmux\.sh/);
    const llama = readFileSync("scripts/llama-tmux.sh", "utf8");
    expect(llama).toMatch(/SESSION="commassist-llm"/);
    expect(llama).toMatch(/tmux new-session/);
    expect(llama).toMatch(/tmux kill-session -t "\$SESSION"/);
    expect(llama).not.toMatch(/tmux kill-server/);
  });

  it("ignores .env and keeps example passwords empty", () => {
    const ignored = execFileSync("git", ["check-ignore", "-v", ".env"], { encoding: "utf8" });
    expect(ignored).toMatch(/\.env/);
    expect(
      execFileSync("git", ["check-ignore", "-v", "gmail_imap_test.py"], { encoding: "utf8" }),
    ).toMatch(/gmail_imap_test\.py/);
    expect(() => execFileSync("git", ["check-ignore", "-v", "PROMPT.md"])).toThrow();
    const example = readFileSync(".env.example", "utf8");
    expect(example).toMatch(/GMAIL_M36_APP_PASSWORD=\s*$/m);
    expect(example).toMatch(/GMAIL_M52_APP_PASSWORD=\s*$/m);
    expect(example).toMatch(/GMAIL_M65_APP_PASSWORD=\s*$/m);
    let trackedPasswords = "";
    try {
      trackedPasswords = execFileSync(
        "git",
        [
          "grep",
          "-n",
          "GMAIL_.*APP_PASSWORD=.",
          "--",
          ":!.env.example",
          ":!docs",
          ":!ARCHITECTURE.md",
          ":!README.md",
          ":!src/lib/demo-bind.test.ts",
        ],
        { encoding: "utf8" },
      );
    } catch {
      trackedPasswords = "";
    }
    expect(trackedPasswords.trim()).toBe("");
  });
});
