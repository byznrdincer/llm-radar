from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import httpx

from llm_radar.events.schemas import EventEnvelope


@dataclass(slots=True)
class CollectorResult:
    events: list[EventEnvelope]
    raw_payload: Any


class BaseCollector(ABC):
    name: str

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    @abstractmethod
    async def collect(self) -> CollectorResult:
        """Fetch a source and return validated events plus its raw payload."""
