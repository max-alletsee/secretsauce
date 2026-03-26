# backend/app/services/recipe_service.py
import base64
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe import Recipe, RecipeVersion
from app.schemas.recipe import RecipeCreate, RecipeUpdate


# ── Cursor helpers ────────────────────────────────────────────────────────────

def _encode_cursor(recipe: Recipe) -> str:
    data = {"created_at": recipe.created_at.isoformat(), "id": str(recipe.id)}
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def _decode_cursor(cursor: str) -> dict:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        data["created_at"] = datetime.fromisoformat(data["created_at"])
        data["id"] = uuid.UUID(data["id"])
        return data
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cursor")


# ── Service functions ─────────────────────────────────────────────────────────

async def create_recipe(
    db: AsyncSession,
    owner_id: uuid.UUID,
    data: RecipeCreate,
) -> tuple[Recipe, RecipeVersion]:
    """Create a new Recipe with its first RecipeVersion in a single transaction."""
    recipe = Recipe(owner_id=owner_id, visibility=data.visibility)
    db.add(recipe)
    await db.flush()  # assign recipe.id without committing

    version = RecipeVersion(
        recipe_id=recipe.id,
        version_number=1,
        title=data.title,
        description=data.description,
        ingredients=[i.model_dump() for i in data.ingredients],
        steps=[s.model_dump() for s in data.steps],
        servings=data.servings,
        prep_time_minutes=data.prep_time_minutes,
        waiting_time_minutes=data.waiting_time_minutes,
        cook_time_minutes=data.cook_time_minutes,
        tags=data.tags,
        recipe_source=data.recipe_source.model_dump() if data.recipe_source else None,
        created_by=owner_id,
    )
    db.add(version)
    await db.flush()  # assign version.id

    recipe.current_version_id = version.id
    recipe.updated_at = datetime.now(timezone.utc)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    await db.refresh(version)
    return recipe, version


async def get_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> tuple[Recipe, RecipeVersion]:
    """Fetch a recipe with its current version. Returns 404 if not found or not accessible."""
    result = await db.execute(
        select(Recipe, RecipeVersion)
        .join(RecipeVersion, Recipe.current_version_id == RecipeVersion.id)
        .where(Recipe.id == recipe_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe, version = row
    if recipe.visibility == "private" and recipe.owner_id != current_user_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe, version


async def list_recipes(
    db: AsyncSession,
    current_user_id: uuid.UUID,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[tuple[Recipe, RecipeVersion]], str | None, bool]:
    """
    List recipes visible to current_user (own + shared), newest first.
    Returns (items, next_cursor, has_more). Items are (Recipe, RecipeVersion) tuples.
    """
    query = (
        select(Recipe, RecipeVersion)
        .join(RecipeVersion, Recipe.current_version_id == RecipeVersion.id)
        .where(
            (Recipe.owner_id == current_user_id) | (Recipe.visibility == "shared")
        )
        .order_by(Recipe.created_at.desc(), Recipe.id.desc())
        .limit(limit + 1)
    )

    if cursor:
        cursor_data = _decode_cursor(cursor)
        query = query.where(
            (Recipe.created_at < cursor_data["created_at"])
            | (
                (Recipe.created_at == cursor_data["created_at"])
                & (Recipe.id < cursor_data["id"])
            )
        )

    result = await db.execute(query)
    rows = result.all()

    has_more = len(rows) > limit
    items = list(rows[:limit])
    next_cursor = _encode_cursor(items[-1][0]) if has_more else None
    return items, next_cursor, has_more


async def update_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
    data: RecipeUpdate,
) -> tuple[Recipe, RecipeVersion]:
    """Copy-on-write update: creates a new RecipeVersion and points current_version_id at it."""
    recipe, current_version = await get_recipe(db, recipe_id, current_user_id)
    if recipe.owner_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not the recipe owner")

    count_result = await db.execute(
        select(func.count()).where(RecipeVersion.recipe_id == recipe_id)
    )
    version_count = count_result.scalar_one()

    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=version_count + 1,
        title=data.title if data.title is not None else current_version.title,
        description=data.description if data.description is not None else current_version.description,
        ingredients=(
            [i.model_dump() for i in data.ingredients]
            if data.ingredients is not None
            else current_version.ingredients
        ),
        steps=(
            [s.model_dump() for s in data.steps]
            if data.steps is not None
            else current_version.steps
        ),
        servings=data.servings if data.servings is not None else current_version.servings,
        prep_time_minutes=(
            data.prep_time_minutes
            if data.prep_time_minutes is not None
            else current_version.prep_time_minutes
        ),
        waiting_time_minutes=(
            data.waiting_time_minutes
            if data.waiting_time_minutes is not None
            else current_version.waiting_time_minutes
        ),
        cook_time_minutes=(
            data.cook_time_minutes
            if data.cook_time_minutes is not None
            else current_version.cook_time_minutes
        ),
        tags=data.tags if data.tags is not None else current_version.tags,
        recipe_source=(
            data.recipe_source.model_dump()
            if data.recipe_source is not None
            else current_version.recipe_source
        ),
        created_by=current_user_id,
    )
    db.add(new_version)
    await db.flush()

    recipe.current_version_id = new_version.id
    if data.visibility is not None:
        recipe.visibility = data.visibility
    recipe.updated_at = datetime.now(timezone.utc)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    await db.refresh(new_version)
    return recipe, new_version


async def delete_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> None:
    """Delete a recipe and all its versions. Owner only."""
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.owner_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not the recipe owner")

    # Nullify current_version_id first to break the circular FK before deleting versions
    recipe.current_version_id = None
    db.add(recipe)
    await db.flush()

    versions_result = await db.execute(
        select(RecipeVersion).where(RecipeVersion.recipe_id == recipe_id)
    )
    for version in versions_result.scalars().all():
        await db.delete(version)
    await db.flush()

    await db.delete(recipe)
    await db.commit()


async def get_versions(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> list[RecipeVersion]:
    """Return all versions of a recipe, newest first. Respects visibility."""
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.visibility == "private" and recipe.owner_id != current_user_id:
        raise HTTPException(status_code=404, detail="Recipe not found")

    versions_result = await db.execute(
        select(RecipeVersion)
        .where(RecipeVersion.recipe_id == recipe_id)
        .order_by(RecipeVersion.version_number.desc())
    )
    return list(versions_result.scalars().all())


async def restore_version(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> tuple[Recipe, RecipeVersion]:
    """
    Create a new RecipeVersion copying the content of the target version,
    then set it as current. Append-only: old versions are never mutated.
    Owner only.
    """
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.owner_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not the recipe owner")

    target_result = await db.execute(
        select(RecipeVersion).where(
            RecipeVersion.id == version_id,
            RecipeVersion.recipe_id == recipe_id,
        )
    )
    target = target_result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Version not found")

    count_result = await db.execute(
        select(func.count()).where(RecipeVersion.recipe_id == recipe_id)
    )
    version_count = count_result.scalar_one()

    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=version_count + 1,
        title=target.title,
        description=target.description,
        ingredients=target.ingredients,
        steps=target.steps,
        servings=target.servings,
        prep_time_minutes=target.prep_time_minutes,
        waiting_time_minutes=target.waiting_time_minutes,
        cook_time_minutes=target.cook_time_minutes,
        tags=target.tags,
        recipe_source=target.recipe_source,
        created_by=current_user_id,
    )
    db.add(new_version)
    await db.flush()

    recipe.current_version_id = new_version.id
    recipe.updated_at = datetime.now(timezone.utc)
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    await db.refresh(new_version)
    return recipe, new_version
