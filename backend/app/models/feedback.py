"""Per-case feedback on individual resources.

Two states for now — `completed` (the user did it) and `dismissed`
(not for me). The recommender honours both: completions get a soft
penalty, dismissals are filtered out entirely.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)

from ..extensions import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CaseResourceFeedback(db.Model):
    __tablename__ = "case_resource_feedback"

    id = Column(Integer, primary_key=True)
    case_id = Column(
        Integer,
        ForeignKey("recovery_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resource_id = Column(String(64), ForeignKey("resources.id"), nullable=False, index=True)

    # 'completed' | 'dismissed'
    status = Column(String(16), nullable=False)

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    __table_args__ = (
        UniqueConstraint("case_id", "resource_id", name="uq_case_resource_feedback"),
    )

    def to_dict(self) -> dict:
        return {
            "case_id": self.case_id,
            "resource_id": self.resource_id,
            "status": self.status,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
