import sys
import os
import types

# Add the backend directory to sys.path so `app.*` imports resolve.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Stub out Flask extension modules that are unavailable in the test
# environment so that importing app.services.* does not trigger
# installation errors from app/__init__.py.
def _make_stub(name, attrs):
    mod = types.ModuleType(name)
    for attr, val in attrs.items():
        setattr(mod, attr, val)
    sys.modules[name] = mod

if "flask_compress" not in sys.modules:
    _make_stub("flask_compress", {"Compress": type("Compress", (), {"__init__": lambda self, *a, **kw: None})})

if "flask_cors" not in sys.modules:
    _make_stub("flask_cors", {"CORS": lambda *a, **kw: None})
