from llm_radar.company_domains import canonical_company_slug, company_website_url, known_company_domain


def test_slug_aliases_resolve_to_canonical_domains() -> None:
    assert canonical_company_slug("zai-org") == "zai"
    assert known_company_domain("zai-org") == "z.ai"
    assert known_company_domain("gemini") == "google.com"
    assert known_company_domain("moonshotai") == "moonshot.cn"


def test_known_company_domains_include_recent_providers() -> None:
    assert known_company_domain("nanogpt") == "nano-gpt.com"
    assert known_company_domain("thinkingmachines") == "thinkingmachines.com"
    assert known_company_domain("aion-labs") == "aionlabs.ai"


def test_unknown_community_publishers_have_no_domain() -> None:
    assert known_company_domain("alicankiraz0") is None
    assert known_company_domain("mradermacher") is None
    assert company_website_url("mradermacher") is None


def test_company_website_url_is_https_for_known_companies() -> None:
    assert company_website_url("openai") == "https://openai.com/"
