import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from llm_radar.admin import ADMIN_SECRET_KEY, create_admin
from llm_radar.api.engagement import router as engagement_router
from llm_radar.api.insights import router as insights_router
from llm_radar.api.intel import router as intel_router
from llm_radar.api.routes import DatabaseSession, router
from llm_radar.config import get_settings
from llm_radar.observability import API_REQUESTS, metrics_response, refresh_gauges

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    try:
        from llm_radar.bootstrap import seed

        seed()
    except Exception:
        logger.warning("source catalog seed skipped", exc_info=True)
    yield


app = FastAPI(
    title="LLM Radar API",
    description="LLM model, price, benchmark and technology change intelligence API",
    version="0.1.0",
    lifespan=lifespan,
)
# insights_router must register before router so /models/turkish is not captured
# by /models/{model_id}.
app.include_router(insights_router)
app.include_router(engagement_router)
app.include_router(intel_router)
app.include_router(router)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[host.strip() for host in settings.api_allowed_hosts.split(",")],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.api_allowed_origins.split(",")],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=ADMIN_SECRET_KEY,
    same_site="lax",
    https_only=settings.app_env == "production",
)

admin = create_admin()
admin.mount_to(app)


@app.middleware("http")
async def security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.app_env == "production":
        # Only asserted once we know we're a real deployment: TLS itself is
        # terminated by whatever reverse proxy/load balancer sits in front
        # of this process, not by FastAPI/uvicorn - this header just tells
        # browsers to never fall back to plain HTTP once they've seen it.
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    API_REQUESTS.labels(
        path=request.url.path, method=request.method, status=str(response.status_code)
    ).inc()
    return response


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "llm-radar-api"}


@app.get("/metrics", tags=["system"], include_in_schema=False)
async def metrics(session: DatabaseSession) -> Response:
    # Outbox backlog and stale sources reflect DB state, not something this
    # process's request handlers naturally emit as they happen (unlike
    # API_REQUESTS), and processor/outbox-worker/scheduler run as separate
    # containers Prometheus never scrapes - so compute them here, on every
    # scrape, from the one process/endpoint that is actually collected.
    refresh_gauges(session, source_stale_after_hours=settings.source_stale_after_hours)
    payload, content_type = metrics_response()
    return Response(content=payload, media_type=content_type)


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"name": "LLM Radar", "docs": "/docs"}
