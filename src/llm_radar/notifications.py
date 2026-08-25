import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.config import get_settings
from llm_radar.database.models import ChangeEvent, Notification, NotificationRule, User

logger = logging.getLogger(__name__)

IMPORTANCE_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def rule_matches(rule: NotificationRule, event: ChangeEvent) -> bool:
    if not rule.is_active:
        return False
    if IMPORTANCE_RANK.get(event.importance, 0) < IMPORTANCE_RANK.get(rule.min_importance, 0):
        return False
    if rule.event_types and event.event_type not in rule.event_types:
        return False
    if rule.min_change_pct is not None and event.change_percentage is not None:
        if abs(event.change_percentage) < rule.min_change_pct:
            return False
    return True


def dispatch_notifications(session: Session, events: list[ChangeEvent]) -> int:
    if not events:
        return 0
    rules = session.scalars(
        select(NotificationRule).where(NotificationRule.is_active.is_(True))
    ).all()
    created = 0
    for event in events:
        body = event.description or event.title
        session.add(
            Notification(
                user_id=None,
                change_event_id=event.id,
                channel="in_app",
                status="unread",
                title=event.title,
                body=body,
                importance=event.importance,
            )
        )
        created += 1
        for rule in rules:
            if not rule_matches(rule, event):
                continue
            for channel in rule.channels or ["in_app"]:
                session.add(
                    Notification(
                        user_id=rule.user_id,
                        change_event_id=event.id,
                        channel=str(channel),
                        status="queued" if channel != "in_app" else "unread",
                        title=event.title,
                        body=body,
                        importance=event.importance,
                    )
                )
                created += 1
                _deliver(channel, event)
    return created


def _deliver(channel: str, event: ChangeEvent) -> None:
    settings = get_settings()
    message = f"{event.importance.upper()}: {event.title}"
    try:
        if channel == "telegram" and settings.telegram_bot_token:
            logger.info("telegram notification queued: %s", message)
        elif channel == "slack" and settings.slack_webhook_url:
            logger.info("slack notification queued: %s", message)
        elif channel == "email" and settings.smtp_url:
            logger.info("email notification queued: %s", message)
    except Exception:
        logger.exception("notification channel %s failed", channel)


def ensure_default_user(session: Session) -> User:
    user = session.scalar(select(User).where(User.email == "radar@localhost"))
    if user is None:
        user = User(email="radar@localhost", display_name="LLM Radar", is_admin=True)
        session.add(user)
        session.flush()
        session.add(
            NotificationRule(
                user_id=user.id,
                event_types=[],
                min_importance="medium",
                channels=["in_app"],
                digest="instant",
            )
        )
    return user
