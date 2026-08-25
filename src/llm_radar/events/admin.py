from confluent_kafka.admin import AdminClient, NewTopic  # type: ignore[attr-defined]

from llm_radar.config import get_settings
from llm_radar.events.topics import ALL_TOPICS


def create_topics() -> dict[str, str]:
    admin = AdminClient({"bootstrap.servers": get_settings().kafka_bootstrap_servers})
    requested = [NewTopic(name, num_partitions=3, replication_factor=1) for name in ALL_TOPICS]
    results: dict[str, str] = {}

    for name, future in admin.create_topics(requested).items():
        try:
            future.result()
            results[name] = "created"
        except Exception as exc:  # confluent-kafka exposes broker errors at runtime
            if "TOPIC_ALREADY_EXISTS" in str(exc):
                results[name] = "exists"
            else:
                raise
    return results


if __name__ == "__main__":
    for topic, status in create_topics().items():
        print(f"{topic}: {status}")
