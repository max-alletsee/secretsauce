# backend/app/main.py
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin as admin_routes
from app.api.routes import health, recipes
from app.api.routes import meal_plans as meal_plans_routes
from app.api.routes import shopping_lists as shopping_lists_routes
from app.api.routes.import_tasks import recipes_router as import_recipes_router
from app.api.routes.import_tasks import tasks_router as import_tasks_router
from app.api.routes.users import auth_router, users_router
from app.core.config import settings
from app.core.rate_limit import rate_limit_middleware
from app.tasks.cleanup import cleanup_old_uploads


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(cleanup_old_uploads)
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
app.include_router(import_recipes_router, prefix="/api/v1/recipes", tags=["import"])
app.include_router(import_tasks_router, prefix="/api/v1/import-tasks", tags=["import"])
app.include_router(admin_routes.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(meal_plans_routes.router, prefix="/api/v1/meal-plans", tags=["meal-plans"])
app.include_router(shopping_lists_routes.router, prefix="/api/v1/shopping-lists", tags=["shopping-lists"])
