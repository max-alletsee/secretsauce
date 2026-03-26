# backend/app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, recipes
from app.api.routes.users import auth_router, users_router
from app.core.config import settings
from app.core.rate_limit import rate_limit_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="secretsauce.food API",
    version="0.1.0",
    lifespan=lifespan,
)

# Note: Starlette middleware runs in reverse declaration order (last declared = outermost).
# rate_limit_middleware is declared last so it executes first on incoming requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(rate_limit_middleware)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["recipes"])
