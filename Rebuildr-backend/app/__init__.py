import os
from flask import Flask
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from .config import Config
from .db import init_db
from .errors import CaseError


def create_app(config_object=None):
    app = Flask(__name__)

    if config_object is None:
        config_object = Config()
    app.config.from_object(config_object)

    origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    CORS(app, origins=origins)

    if not app.config.get("TESTING"):
        init_db(app.config["SUPABASE_URL"], app.config["SUPABASE_SERVICE_ROLE_KEY"])

    from .routes.cases import cases_bp
    app.register_blueprint(cases_bp)

    @app.errorhandler(CaseError)
    def handle_case_error(e):
        body, status = e.to_response()
        return body, status

    @app.errorhandler(HTTPException)
    def handle_http(e):
        return {
            "error": {
                "code": e.name,
                "message": e.description,
                "details": {},
            }
        }, e.code

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
