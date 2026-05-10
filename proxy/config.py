from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://agentsense:agentsense@localhost:5432/agentsense"
    CLOD_API_URL: str = "https://api.clod.ai/v1/chat"
    CLOD_API_KEY: str = ""
    JUDGE_MODEL: str = ""
    CLASSIFIER_URL: str = "http://localhost:8001/classify"
    OPENCLAW_URL: str = "http://127.0.0.1:18789/api"
    OPENCLAW_CHANNEL: str = "telegram"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
