from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, Integer, String

from ..extensions import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RecoveryCase(db.Model):
    __tablename__ = "recovery_cases"

    id = Column(Integer, primary_key=True)
    case_name = Column(String(255), nullable=False)
    disaster_type = Column(String(64), nullable=False)
    location = Column(String(255), nullable=False)
    incident_date = Column(Date, nullable=False)

    insurance_provider = Column(String(255), nullable=True)
    insurance_policy_number = Column(String(128), nullable=True)

    # Lifecycle: draft → in_progress → submitted → closed
    status = Column(String(32), nullable=False, default="draft")

    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "case_name": self.case_name,
            "disaster_type": self.disaster_type,
            "location": self.location,
            "incident_date": self.incident_date.isoformat() if self.incident_date else None,
            "insurance_provider": self.insurance_provider,
            "insurance_policy_number": self.insurance_policy_number,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }
