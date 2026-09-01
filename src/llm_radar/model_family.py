from __future__ import annotations

import re

_FAMILIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("GPT", ("gpt-", "gpt ", "chatgpt")),
    ("OpenAI o-series", ("/o1", "/o3", "/o4", "o1-", "o3-", "o4-")),
    ("Claude", ("claude",)),
    ("Gemini", ("gemini",)),
    ("Gemma", ("gemma",)),
    ("Llama", ("llama",)),
    ("Qwen", ("qwen", "qwq")),
    ("DeepSeek", ("deepseek",)),
    ("Mistral", ("mistral", "mixtral", "codestral", "devstral")),
    ("Kimi", ("kimi",)),
    ("Command", ("command-r", "command a")),
    ("Grok", ("grok",)),
    ("Phi", ("phi-", "phi ")),
    ("Nova", ("nova",)),
    ("GLM", ("glm-", "glm ")),
    ("MiniMax", ("minimax",)),
    ("Nemotron", ("nemotron",)),
)


def infer_model_family(name: str, slug: str) -> str:
    value = f"{slug} {name}".lower()
    for family, needles in _FAMILIES:
        if any(needle in value for needle in needles):
            return family
    model_part = slug.split("/", 1)[-1]
    base = re.split(r"[-_: ](?:v?\d|latest|preview|instruct|chat)", model_part, maxsplit=1)[0]
    base = base.replace("-", " ").strip()
    return base.title() if base else "Diğer"
