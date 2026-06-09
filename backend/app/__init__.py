from flask import Flask, jsonify
from flask_compress import Compress
from flask_cors import CORS

from .config import Config


def create_app(config_class: type = Config) -> Flask:
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(config_class)
    # Gzip JSON responses — the documents/cases lists are the hot paths and
    # compress well. flask-compress only kicks in above ~500 bytes by default.
    Compress(app)
    CORS(app, supports_credentials=True)

    from .blueprints.health import bp as health_bp
    from .blueprints.auth import bp as auth_bp
    from .blueprints.cases import bp as cases_bp
    from .blueprints.items import bp as items_bp
    from .blueprints.recommendations import bp as recs_bp
    from .blueprints.documents import bp as documents_bp
    from .blueprints.ml import bp as ml_bp
    from .blueprints.terms import bp as terms_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(cases_bp)
    app.register_blueprint(items_bp)
    app.register_blueprint(recs_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(ml_bp)
    app.register_blueprint(terms_bp)

    # The resources catalog rarely changes; let the browser cache it. Other
    # endpoints stay no-store because they're per-user and mutate often.
    @app.after_request
    def _cache_headers(response):
        from flask import request as _req
        if _req.path.startswith("/recommendations/resources"):
            response.headers.setdefault("Cache-Control", "private, max-age=300")
        else:
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.errorhandler(404)
    def _not_found(_e):
        return jsonify({"error": "not found"}), 404

    @app.errorhandler(405)
    def _method_not_allowed(_e):
        return jsonify({"error": "method not allowed"}), 405

    return app
