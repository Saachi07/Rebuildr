"""Flask CLI commands.

refresh-resources keeps the shared resources catalog fresh without a
per-user, on-demand scrape. Run it on a schedule (cron on Linux, Task
Scheduler on Windows), for example daily:

    flask --app run refresh-resources

It reuses the same scraper the per-case endpoint uses, but sweeps a
default grid of regions and disaster types so the catalog stays warm for
everyone instead of being refreshed only when one user clicks a button.
"""

from __future__ import annotations

import click
from flask import Flask, current_app

# A small grid that covers the catalog's main audiences. Disaster types
# match the values the frontend offers when creating a case.
DEFAULT_REGIONS = ("AB",)
DEFAULT_DISASTERS = ("wildfire", "flood", "tornado", "other")


def register_commands(app: Flask) -> None:
    @app.cli.command("refresh-resources")
    @click.option("--region", "regions", multiple=True, default=DEFAULT_REGIONS, show_default=True)
    @click.option("--disaster", "disasters", multiple=True, default=DEFAULT_DISASTERS, show_default=True)
    def refresh_resources(regions: tuple[str, ...], disasters: tuple[str, ...]) -> None:
        """Refresh the shared assistance-program catalog from curated sources."""
        from .extensions import service_client
        from .services.program_scraper import scrape_programs_for_case

        api_key = current_app.config.get("GEMINI_API_KEY")
        if not api_key:
            click.echo("GEMINI_API_KEY is not configured; nothing to do.")
            return

        svc = service_client()
        total_found = 0
        total_added = 0
        for region in regions:
            for disaster in disasters:
                # The scraper takes a case-shaped dict; a synthetic case per
                # region/disaster cell sweeps the same sources a real user
                # in that situation would hit.
                synthetic_case = {
                    "region": region,
                    "disaster_type": disaster,
                    "incident_date": None,
                }
                try:
                    result = scrape_programs_for_case(synthetic_case, set(), api_key, svc)
                except Exception as exc:  # noqa: BLE001 - keep sweeping other cells
                    click.echo(f"  {region}/{disaster}: failed ({exc})")
                    continue
                found = result.get("programs_found", 0)
                added = result.get("programs_added", 0)
                total_found += found
                total_added += added
                click.echo(f"  {region}/{disaster}: found {found}, added {added}")
        click.echo(f"Done. Found {total_found} programs, added {total_added} new ones.")
