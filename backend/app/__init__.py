from flask import Flask
from flask_cors import CORS

from .config import Config


def create_app(config_class: type = Config) -> Flask:
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(config_class)
    CORS(app, supports_credentials=True)

    from .blueprints.health import bp as health_bp
    from .blueprints.auth import bp as auth_bp
    from .blueprints.cases import bp as cases_bp
    from .blueprints.items import bp as items_bp
    from .blueprints.recommendations import bp as recs_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(cases_bp)
    app.register_blueprint(items_bp)
    app.register_blueprint(recs_bp)

    return app
