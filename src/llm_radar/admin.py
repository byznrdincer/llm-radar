from __future__ import annotations

import os
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from sqlalchemy import String, Text, func, select
from sqlalchemy import inspect as sa_inspect
from starlette.requests import Request
from starlette_admin import (
    CardRowWidget,
    ColumnWidget,
    CustomView,
    DropDown,
    HtmlWidget,
    I18nConfig,
    StatWidget,
    TableWidget,
)
from starlette_admin.auth import AdminUser, AuthProvider, LoginFailed
from starlette_admin.contrib.sqla import Admin, ModelView

from llm_radar.database.models import (
    AnalyticsEvent,
    BenchmarkRun,
    ChangeEvent,
    Company,
    EntityAlias,
    Feedback,
    Model,
    ModelDemand,
    PriceObservation,
    ResearchPaper,
    Source,
    TechnologySignal,
)
from llm_radar.database.session import engine


def load_admin_env() -> None:
    path = Path(".admin.env")
    if not path.exists():
        return

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


# Non-production dev defaults so a clean checkout / `docker compose up` starts
# without a hand-provided .admin.env. Production must set real values.
_ADMIN_DEV_DEFAULTS = {
    "LLM_RADAR_ADMIN_USERNAME": "admin",
    "LLM_RADAR_ADMIN_PASSWORD": "change-me",
    "LLM_RADAR_ADMIN_SECRET_KEY": "dev-insecure-admin-secret-key-change-me",  # noqa: S105
}


def _admin_credential(key: str) -> str:
    value = os.environ.get(key)
    if value:
        return value
    if os.environ.get("APP_ENV") == "production":
        raise RuntimeError(
            f"{key} must be set in production - copy .admin.env.example to .admin.env "
            "or pass it through the environment"
        )
    return _ADMIN_DEV_DEFAULTS[key]


load_admin_env()

ADMIN_USERNAME = _admin_credential("LLM_RADAR_ADMIN_USERNAME")
ADMIN_PASSWORD = _admin_credential("LLM_RADAR_ADMIN_PASSWORD")
ADMIN_SECRET_KEY = _admin_credential("LLM_RADAR_ADMIN_SECRET_KEY")


class RadarAdminAuth(AuthProvider):
    async def login(
        self,
        username: str,
        password: str,
        remember_me: bool,
        request: Request,
    ) -> None:
        username_ok = secrets.compare_digest(username, ADMIN_USERNAME)
        password_ok = secrets.compare_digest(password, ADMIN_PASSWORD)

        if not username_ok or not password_ok:
            raise LoginFailed("Kullanıcı adı veya şifre hatalı")

        request.session["admin_username"] = ADMIN_USERNAME

    async def authenticate(self, request: Request) -> AdminUser | None:
        username = request.session.get("admin_username")

        if username != ADMIN_USERNAME:
            return None

        return AdminUser(username="LLM Radar Yöneticisi")

    async def logout(self, request: Request) -> None:
        request.session.clear()


class RadarModelView(ModelView):
    def can_create(self, request: Request) -> bool:
        return False

    def can_edit(self, request: Request) -> bool:
        return False

    def can_delete(self, request: Request) -> bool:
        return False

    def can_import(self, request: Request) -> bool:
        return False

    def can_export(self, request: Request) -> bool:
        return True

    def can_view_detail(self, request: Request) -> bool:
        return True


MODEL_LABELS: dict[str, tuple[str, str]] = {
    "Model": ("Model", "Modeller"),
    "Company": ("Şirket", "Şirketler"),
    "PriceObservation": ("Fiyat Kaydı", "Fiyatlar"),
    "BenchmarkRun": ("Benchmark Sonucu", "Benchmark Sonuçları"),
    "ChangeEvent": ("Gelişme", "Gelişmeler"),
    "ResearchPaper": ("Araştırma", "Araştırmalar"),
    "TechnologySignal": ("Teknoloji Sinyali", "Teknoloji Sinyalleri"),
    "Source": ("Kaynak", "Kaynaklar"),
    "AnalyticsEvent": ("Kullanıcı Etkileşimi", "Kullanıcı Etkileşimleri"),
    "Feedback": ("Geri Bildirim", "Geri Bildirimler"),
    "ModelDemand": ("LLMaaS Model Talebi", "LLMaaS Model Talepleri"),
    "EntityAlias": ("Alias Eşleşmesi", "Alias Eşleşmeleri"),
}


FIELD_LABELS: dict[str, str] = {
    "id": "ID",
    "name": "Ad",
    "slug": "Teknik Ad",
    "description": "Açıklama",
    "url": "Kaynak Adresi",
    "status": "Durum",
    "created_at": "Oluşturulma",
    "updated_at": "Güncellenme",
    "observed_at": "Gözlem Tarihi",
    "published_at": "Yayın Tarihi",
    "collected_at": "Toplanma Tarihi",
    "last_seen_at": "Son Görülme",
    "model_id": "Model",
    "company_id": "Şirket",
    "family_id": "Model Ailesi",
    "source_id": "Kaynak",
    "benchmark_id": "Benchmark",
    "event_type": "Etkileşim Türü",
    "event_metadata": "Etkileşim Detayı",
    "related_model_ids": "İlgili Modeller",
    "filters": "Kullanılan Filtreler",
    "sort": "Sıralama",
    "page": "Sayfa",
    "feedback_type": "Geri Bildirim Türü",
    "message": "Mesaj",
    "related_model_id": "İlgili Model",
    "subject": "Konu",
    "severity": "Önem Derecesi",
    "source_url": "Kaynak Adresi",
    "product_area": "Ürün Alanı",
    "requested_models": "İstenen Modeller",
    "requested_model_ids": "Model ID'leri",
    "other_model": "Diğer Model",
    "use_cases": "Kullanım Senaryoları",
    "criteria": "Seçim Kriterleri",
    "demand_level": "Talep Seviyesi",
    "license": "Lisans",
    "capabilities": "Yetenekler",
    "modalities": "Modaliteler",
    "developer": "Geliştirici",
    "developer_id": "Geliştirici",
    "input_price": "Girdi Fiyatı",
    "output_price": "Çıktı Fiyatı",
    "currency": "Para Birimi",
    "score": "Skor",
    "canonical_key": "Kanonik Model",
    "alias_key": "Alias",
    "method": "Yöntem",
    "confidence": "Güven",
    "approved": "Onaylı",
}


SENSITIVE_FIELDS = {
    "password",
    "password_hash",
    "hashed_password",
    "secret",
    "secret_key",
    "api_key",
    "access_token",
    "refresh_token",
    "private_key",
}

TECHNICAL_LIST_FIELDS = {
    "id",
    "session_id",
    "requested_model_ids",
}


def build_view(
    model: type[Any],
    icon: str,
) -> RadarModelView:
    display_name, menu_label = MODEL_LABELS[model.__name__]
    mapper = sa_inspect(model)

    # SADE ADMIN:
    # Yalnızca tablonun kendi kolonlarını kullan.
    # relationship() alanlarını hiç ModelView'e vermediğimiz için
    # ModelSnapshot / ProviderEndpoint gibi teknik view'lara ihtiyaç kalmaz.
    field_names = [
        column.key
        for column in mapper.columns
        if column.key not in SENSITIVE_FIELDS
    ]

    searchable = [
        column.key
        for column in mapper.columns
        if isinstance(column.type, (String, Text))
        and column.key not in SENSITIVE_FIELDS
    ]

    attrs: dict[str, Any] = {
        "fields": field_names,
        "searchable_fields": searchable,
    }

    column_names = set(field_names)

    if "created_at" in column_names:
        attrs["fields_default_sort"] = [("created_at", True)]
    elif "observed_at" in column_names:
        attrs["fields_default_sort"] = [("observed_at", True)]
    elif "name" in column_names:
        attrs["fields_default_sort"] = [("name", False)]

    # fields class attribute'i __init__'den ÖNCE tanımlanmış olur.
    ConfiguredView = type(
        f"{model.__name__}RadarView",
        (RadarModelView,),
        attrs,
    )

    view = ConfiguredView(
        model,
        icon=icon,
        display_name=display_name,
        menu_label=menu_label,
    )

    hidden_list = sorted(
        column_names & TECHNICAL_LIST_FIELDS
    )

    view.exclude_fields_from_list = hidden_list
    view.exclude_fields_from_detail = []
    view.exclude_fields_from_export = []

    for field in view.fields or []:
        translated = FIELD_LABELS.get(field.name)
        if translated:
            field.label = translated

    return cast(RadarModelView, view)


FEEDBACK_TYPES = {
    "missing_model": "Eksik model",
    "data_error": "Hatalı model verisi",
    "pricing_error": "Fiyat hatası",
    "benchmark_error": "Benchmark hatası",
    "source_suggestion": "Kaynak önerisi",
    "filter_suggestion": "Filtre önerisi",
    "feature_request": "Özellik isteği",
    "ux_feedback": "UI/UX geri bildirimi",
    "bug_report": "Hata bildirimi",
    "general": "Genel yorum",
}


async def total_models(request: Request) -> int:
    session = request.state.session
    return session.scalar(select(func.count(Model.id))) or 0


async def new_feedbacks(request: Request) -> int:
    session = request.state.session
    return (
        session.scalar(
            select(func.count(Feedback.id)).where(Feedback.status == "new")
        )
        or 0
    )


async def total_demands(request: Request) -> int:
    session = request.state.session
    return session.scalar(select(func.count(ModelDemand.id))) or 0


async def today_interactions(request: Request) -> int:
    session = request.state.session

    start = datetime.now(UTC).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )

    return (
        session.scalar(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.created_at >= start
            )
        )
        or 0
    )


async def recent_feedback_rows(request: Request) -> list[list[Any]]:
    session = request.state.session

    items = session.scalars(
        select(Feedback)
        .order_by(Feedback.created_at.desc())
        .limit(5)
    ).all()

    rows: list[list[Any]] = []

    for item in items:
        rows.append(
            [
                FEEDBACK_TYPES.get(item.feedback_type, item.feedback_type),
                item.message[:80],
                item.status,
                item.created_at.strftime("%d.%m.%Y %H:%M"),
            ]
        )

    return rows


async def recent_demand_rows(request: Request) -> list[list[Any]]:
    session = request.state.session

    items = session.scalars(
        select(ModelDemand)
        .order_by(ModelDemand.created_at.desc())
        .limit(5)
    ).all()

    rows: list[list[Any]] = []

    for item in items:
        models = list(item.requested_models or [])

        if item.other_model:
            models.append(item.other_model)

        rows.append(
            [
                ", ".join(models) if models else "—",
                item.demand_level or "Belirtilmedi",
                ", ".join(item.use_cases or []) or "—",
                item.created_at.strftime("%d.%m.%Y %H:%M"),
            ]
        )

    return rows


async def build_dashboard(request: Request) -> ColumnWidget:
    return ColumnWidget(
        children=[
            HtmlWidget(
                html="""
                <div class="alert alert-info mb-3">
                  <strong>LLM Radar Yönetim Paneli</strong><br>
                  Buradan model verilerini, fiyatları, gelişmeleri ve
                  kullanıcı geri bildirimlerini takip edebilirsiniz.
                </div>
                """
            ),
            CardRowWidget(
                children=[
                    StatWidget(
                        title="Toplam Model",
                        value_callback=total_models,
                        description="Katalogdaki modeller",
                        countup=True,
                    ),
                    StatWidget(
                        title="Yeni Geri Bildirim",
                        value_callback=new_feedbacks,
                        description="İncelenmeyi bekleyen",
                        countup=True,
                    ),
                    StatWidget(
                        title="LLMaaS Talepleri",
                        value_callback=total_demands,
                        description="Toplam model talebi",
                        countup=True,
                    ),
                    StatWidget(
                        title="Bugünkü Etkileşim",
                        value_callback=today_interactions,
                        description="Bugün kaydedilen kullanıcı olayları",
                        countup=True,
                    ),
                ]
            ),
            TableWidget(
                title="Son Geri Bildirimler",
                columns=[
                    "Tür",
                    "Mesaj",
                    "Durum",
                    "Tarih",
                ],
                rows_callback=recent_feedback_rows,
            ),
            TableWidget(
                title="Son LLMaaS Model Talepleri",
                columns=[
                    "Modeller",
                    "Talep Seviyesi",
                    "Kullanım",
                    "Tarih",
                ],
                rows_callback=recent_demand_rows,
            ),
        ]
    )


def create_admin() -> Admin:
    from llm_radar.admin_analytics import (
        build_discovery_page,
        build_model_interest_page,
        build_session_inspector,
        build_sessions_page,
        build_user_dashboard,
    )

    admin = Admin(
        engine,
        title="LLM Radar Yönetim Paneli",
        base_url="/admin",
        auth_provider=RadarAdminAuth(),
        secret_key=ADMIN_SECRET_KEY,
        i18n_config=I18nConfig(
            default_locale="tr",
            language_cookie_name=None,
            language_header_name=None,
        ),
        index_view=CustomView(
            menu_label="Genel Bakış",
            icon="fa-solid fa-chart-line",
            widget=build_user_dashboard,
        ),
    )

    event_view = build_view(
        AnalyticsEvent,
        "fa-solid fa-list",
    )
    event_view.menu_label = "Tüm Hareketler"
    event_view.exclude_fields_from_list = ["id"]
    event_view.fields_default_sort = [("created_at", True)]

    admin.add_view(
        DropDown(
            "Kullanıcı Analitiği",
            icon="fa-solid fa-users",
            views=[
                CustomView(
                    menu_label="Oturumlar",
                    icon="fa-solid fa-user-clock",
                    path="/analytics/sessions",
                    widget=build_sessions_page,
                ),
                CustomView(
                    menu_label="Oturum İncele",
                    icon="fa-solid fa-magnifying-glass",
                    path="/analytics/session",
                    widget=build_session_inspector,
                ),
                CustomView(
                    menu_label="Model İlgisi",
                    icon="fa-solid fa-heart",
                    path="/analytics/model-interest",
                    widget=build_model_interest_page,
                ),
                CustomView(
                    menu_label="Aramalar ve Filtreler",
                    icon="fa-solid fa-filter",
                    path="/analytics/discovery",
                    widget=build_discovery_page,
                ),
                event_view,
            ],
        )
    )

    admin.add_view(
        DropDown(
            "Talep ve Geri Bildirim",
            icon="fa-solid fa-comments",
            views=[
                build_view(
                    ModelDemand,
                    "fa-solid fa-hand",
                ),
                build_view(
                    Feedback,
                    "fa-solid fa-comment",
                ),
            ],
        )
    )

    alias_view = build_view(EntityAlias, "fa-solid fa-link")
    alias_view.menu_label = "Alias Eşleşmeleri"
    # The only view where editing is allowed: approving/rejecting an
    # ambiguous cross-source model match (EntityAlias.approved) is exactly
    # the manual review step link_cross_source_models defers to a human
    # when a canonical name is shared across companies. Every other view
    # stays read-only per RadarModelView's defaults.
    alias_view.can_edit = lambda request: True  # type: ignore[method-assign]

    admin.add_view(
        DropDown(
            "Model Verileri",
            icon="fa-solid fa-cubes",
            views=[
                build_view(Model, "fa-solid fa-cube"),
                build_view(Company, "fa-solid fa-building"),
                alias_view,
            ],
        )
    )

    admin.add_view(
        DropDown(
            "Performans ve Fiyat",
            icon="fa-solid fa-chart-column",
            views=[
                build_view(
                    PriceObservation,
                    "fa-solid fa-tag",
                ),
                build_view(
                    BenchmarkRun,
                    "fa-solid fa-gauge-high",
                ),
            ],
        )
    )

    admin.add_view(
        DropDown(
            "İstihbarat",
            icon="fa-solid fa-bolt",
            views=[
                build_view(ChangeEvent, "fa-solid fa-bolt"),
                build_view(ResearchPaper, "fa-solid fa-file-lines"),
                build_view(
                    TechnologySignal,
                    "fa-solid fa-satellite-dish",
                ),
                build_view(Source, "fa-solid fa-database"),
            ],
        )
    )

    return admin
