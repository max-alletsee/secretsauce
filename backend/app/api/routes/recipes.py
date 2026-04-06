# backend/app/api/routes/recipes.py
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.user import User
from app.schemas.recipe import (
    PaginatedRecipeResponse,
    RecipeCreate,
    RecipeResponse,
    RecipeUpdate,
    RecipeVersionResponse,
)
from app.models.recipe import Recipe, RecipeVersion
from app.services import recipe_service

router = APIRouter()


def _build_recipe_response(recipe: Recipe, version: RecipeVersion) -> RecipeResponse:
    return RecipeResponse(
        id=recipe.id,
        owner_id=recipe.owner_id,
        visibility=recipe.visibility,
        current_version=RecipeVersionResponse.model_validate(version),
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
    )


@router.get("", response_model=PaginatedRecipeResponse)
async def list_recipes(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None),
    tags: list[str] = Query(default=[]),
    sort_by: str = Query(default="created_at_desc"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> PaginatedRecipeResponse:
    items, next_cursor, has_more, popularity_available = await recipe_service.list_recipes(
        db, user.id, cursor=cursor, limit=limit, q=q, tags=tags or None, sort_by=sort_by
    )
    return PaginatedRecipeResponse(
        items=[_build_recipe_response(r, v) for r, v in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.post("", response_model=RecipeResponse, status_code=201)
async def create_recipe(
    data: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeResponse:
    recipe, version = await recipe_service.create_recipe(db, user.id, data)
    return _build_recipe_response(recipe, version)


@router.get("/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeResponse:
    recipe, version = await recipe_service.get_recipe(db, recipe_id, user.id)
    return _build_recipe_response(recipe, version)


@router.patch("/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: uuid.UUID,
    data: RecipeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeResponse:
    recipe, version = await recipe_service.update_recipe(db, recipe_id, user.id, data)
    return _build_recipe_response(recipe, version)


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    await recipe_service.delete_recipe(db, recipe_id, user.id)


@router.get("/{recipe_id}/versions", response_model=list[RecipeVersionResponse])
async def get_versions(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[RecipeVersionResponse]:
    versions = await recipe_service.get_versions(db, recipe_id, user.id)
    return [RecipeVersionResponse.model_validate(v) for v in versions]


@router.post("/{recipe_id}/versions/{version_id}/restore", response_model=RecipeResponse)
async def restore_version(
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> RecipeResponse:
    recipe, version = await recipe_service.restore_version(db, recipe_id, version_id, user.id)
    return _build_recipe_response(recipe, version)
