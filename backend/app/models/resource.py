"""Resource model — the data backing the recommender.

Mirrors the schema documented in `questions/resources.py`. Loaded into
memory at app startup and handed to the standalone `Recommender` in
`questions/recommender.py`; nothing here forces the recommender to know
about SQLAlchemy.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    Integer,
    String,
)

from ..extensions import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Resource(db.Model):
    __tablename__ = "resources"

    # `id` is the stable string id used everywhere (e.g. "ab-drp"),
    # not an auto-increment — matches the seed list in
    # questions/resources.py and the JSON returned to the frontend.
    id = Column(String(64), primary_key=True)

    type = Column(String(32), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(String, nullable=False)
    url = Column(String(512), nullable=True)
    phone = Column(String(64), nullable=True)

    # "AB" / "BC" / ... / "*" (national) or a JSON list of provinces.
    region = Column(String(32), nullable=False, default="*")

    disaster_types = Column(JSON, nullable=False, default=list)
    supports_plans = Column(JSON, nullable=False, default=list)
    requires = Column(JSON, nullable=False, default=list)
    excludes = Column(JSON, nullable=False, default=list)
    insurance_companies = Column(JSON, nullable=True)

    eligibility_days = Column(Integer, nullable=True)
    scraped_at = Column(String(32), nullable=True)  # ISO date as string

    # Scoring extensions.
    max_benefit_cad = Column(Integer, nullable=True)
    priority_floor = Column(Float, nullable=False, default=0.0)
    tags_added = Column(JSON, nullable=False, default=list)

    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    def to_recommender_dict(self) -> dict:
        """Shape used by `questions.recommender.Recommender`."""
        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "body": self.body,
            "url": self.url,
            "phone": self.phone,
            "region": self.region,
            "disaster_types": self.disaster_types or ["*"],
            "supports_plans": self.supports_plans or [],
            "requires": self.requires or [],
            "excludes": self.excludes or [],
            "insurance_companies": self.insurance_companies,
            "eligibility_days": self.eligibility_days,
            "scraped_at": self.scraped_at,
            "max_benefit_cad": self.max_benefit_cad,
            "priority_floor": self.priority_floor or 0.0,
            "tags_added": self.tags_added or [],
        }
