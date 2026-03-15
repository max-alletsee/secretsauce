from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Required
    DATABASE_URL: str
    SECRET_KEY: str
    OPENROUTER_API_KEY: str
    UPLOAD_DIR: str = "/tmp/mealtime-uploads"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # Optional with defaults
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    AI_MODEL: str = "openai/gpt-4o"
    AI_TIMEOUT_SECONDS: int = 60
    AI_MAX_RETRIES: int = 3
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Google OAuth — leave empty to disable Google login
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""


settings = Settings()
