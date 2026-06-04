from flask import Flask

from .config import Config
from .extensions import db, migrate


def create_app(config_class: type = Config) -> Flask:
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)

    from . import models  # noqa: F401  (register models with SQLAlchemy)

    from .blueprints.health import bp as health_bp

    app.register_blueprint(health_bp)

    return app
