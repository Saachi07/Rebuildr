from supabase import create_client, Client

_client: Client | None = None


def init_db(url: str, key: str) -> None:
    global _client
    _client = create_client(url, key)


def get_db() -> Client:
    if _client is None:
        raise RuntimeError("Database client not initialised. Call init_db() first.")
    return _client
