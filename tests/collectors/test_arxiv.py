import httpx
import pytest

from llm_radar.collectors.arxiv import ARXIV_URL, ArxivCollector

ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <title>Agentic Computer Use for LLMs</title>
    <summary>We study computer-use agents and MCP tooling.</summary>
    <published>2026-01-01T00:00:00Z</published>
    <author><name>Ada Lovelace</name></author>
    <category term="cs.AI"/>
  </entry>
</feed>
"""


@pytest.mark.asyncio
async def test_arxiv_collector_emits_research_events() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url).startswith(ARXIV_URL.split("?")[0])
        return httpx.Response(200, text=ATOM)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await ArxivCollector(client).collect()

    assert result.events[0].event_type.value == "research.published"
    assert result.events[0].payload["arxiv_id"] == "2401.00001v1"
    assert "computer_use" in result.events[0].payload["technology_signals"]
    assert "mcp" in result.events[0].payload["technology_signals"]
