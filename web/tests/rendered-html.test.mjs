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

test("server-renders the LLM Radar dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>LLM Radar — AI Intelligence Platform<\/title>/i);
  assert.match(html, /Yapay zekâ dünyasının/);
  assert.match(html, /MODEL KATALOĞU/);
  assert.match(html, /MODEL KARŞILAŞTIRMA/);
  assert.match(html, /TEKNOLOJİ AKIŞI/);
  assert.match(html, /Önemli gelişmeler önce/);
  assert.match(html, /EVENT KATEGORİSİ/);
  assert.match(html, /Model Release/);
  assert.match(html, /İzlenen model/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("renders accessible catalog toggle and navigation", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="model-catalog-content"/);
  assert.match(html, /href="#models"/);
  assert.match(html, /href="#compare"/);
  assert.match(html, /href="#events"/);
});

test("renders the sidebar, comparison chart entry point and benchmark help", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /aria-label="Ana navigasyon"/);
  assert.match(html, /Model kataloğu/);
  assert.match(html, /Benchmarklar/);
  assert.match(html, /Grafikle karşılaştır/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /Chatbot Arena hakkında bilgi/);
});
