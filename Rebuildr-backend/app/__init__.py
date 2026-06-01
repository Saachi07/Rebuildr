from flask import Flask
from .config import Config
from .db import init_db


def create_app(config_object=None):
    app = Flask(__name__)

    if config_object is None:
        config_object = Config()
    app.config.from_object(config_object)

    if not app.config.get("TESTING"):
        init_db(app.config["SUPABASE_URL"], app.config["SUPABASE_SERVICE_ROLE_KEY"])

    from .routes.cases import cases_bp
    app.register_blueprint(cases_bp)

    @app.errorhandler(Exception)
    def handle_unexpected(e):
        return {
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "Something went wrong. Please try again.",
                "details": {},
            }
        }, 500

    return app
