import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    TESTING = False


class TestingConfig(Config):
    TESTING = True
    SUPABASE_URL = "http://localhost"
    SUPABASE_SERVICE_ROLE_KEY = "test-key"
