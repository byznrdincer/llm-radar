import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

// The app is a client component: only the default "overview" view is
// server-rendered. These assertions cover the SSR shell - the parts that must
// be present before hydration. View-specific content (catalog table, compare
// chart, event filters) renders after navigation and is not asserted here.

test("server-renders the dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>LLM Radar<\/title>/i);
  assert.match(html, /LLM INTELLIGENCE PLATFORM/);
  assert.match(html, /Yapay zekâ dünyasının/);
  assert.match(html, /nabzını tut/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("renders the sidebar navigation", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /aria-label="Ana navigasyon"/);
  for (const item of [
    "Genel bakış",
    "Benchmarklar",
    "Model kataloğu",
    "Karşılaştır",
    "Popüler modeller",
    "Gelişmeler",
    "Araştırma",
    "Teknoloji radarı",
    "Geri bildirim",
  ]) {
    assert.match(html, new RegExp(`<span>${item}</span>`));
  }
});

test("renders the topbar and overview metrics", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /language-toggle/);
  assert.match(html, /aria-label="Language \/ Dil"/);
  assert.match(html, /CANLI/);
  assert.match(html, /<strong>Genel bakış<\/strong>/);
  for (const metric of ["İzlenen model", "Takip edilen firma", "Fiyat gözlemi"]) {
    assert.match(html, new RegExp(metric));
  }
});
