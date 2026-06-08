"""Supabase client factories.

Two flavours:

* ``anon_client()`` — uses the public anon key, suitable for auth flows
  (``sign_up``, ``sign_in_with_password``) and per-user data calls after
  the caller's access token has been attached via ``postgrest.auth(token)``.
* ``service_client()`` — uses the service-role key and bypasses RLS.
  Reserved for trusted server-side jobs (catalog seeding, admin tools).
"""

from __future__ import annotations

from flask import current_app
from supabase import Client, create_client


def anon_client() -> Client:
    url = current_app.config["SUPABASE_URL"]
    key = current_app.config["SUPABASE_ANON_KEY"]
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")
    return create_client(url, key)


def service_client() -> Client:
    url = current_app.config["SUPABASE_URL"]
    key = current_app.config["SUPABASE_SERVICE_ROLE_KEY"]
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
        )
    return create_client(url, key)


def user_client(access_token: str) -> Client:
    """Anon-key client with the user's access token attached so RLS applies."""
    client = anon_client()
    client.postgrest.auth(access_token)
    return client
