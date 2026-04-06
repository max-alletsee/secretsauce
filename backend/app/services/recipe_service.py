# backend/app/services/recipe_service.py
import base64
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import RecipeVisibility
from app.models.recipe import Recipe, RecipeVersion
from app.schemas.recipe import RecipeCreate, RecipeUpdate

# Fields copied when cloning a RecipeVersion (used by update and restore).
# If a new content field is added to RecipeVersion, add it here once.
_VERSION_CONTENT_FIELDS = (
    "title", "description", "ingredients", "steps", "servings",
    "prep_time_minutes", "waiting_time_minutes", "cook_time_minutes",
    "tags", "recipe_source",
)


def _build_search_text(
    title: str,
    description: str | None,
    ingredients: list[dict],
) -> str:
    parts = [title]
    if description:
        parts.append(description)
    ingredient_names = " ".join(i["name"] for i in ingredients if "name" in i)
    if ingredient_names:
        parts.append(ingredient_names)
    return " ".join(parts)


async def _set_search_vector(
    db: AsyncSession,
    version_id: uuid.UUID,
    title: str,
    description: str | None,
    ingredients: list[dict],
) -> None:
    text_value = _build_search_text(title, description, ingredients)
    await db.execute(
        sa_update(RecipeVersion)
        .where(RecipeVersion.id == version_id)
        .values(search_vector=func.to_tsvector("english", text_value))
        .execution_options(synchronize_session=False)
    )


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


def _copy_version_fields(source: RecipeVersion) -> dict:
    """Extract content fields from a RecipeVersion as a dict for cloning."""
    return {field: getattr(source, field) for field in _VERSION_CONTENT_FIELDS}


async def _get_recipe_as_owner(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> Recipe:
    """Fetch a recipe and verify ownership. Raises 404/403."""
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.owner_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not the recipe owner")
    return recipe


async def _next_version_number(db: AsyncSession, recipe_id: uuid.UUID) -> int:
    """Return the next version number for a recipe.

    MVP: uses count+1. Concurrent updates on the same recipe could produce
    duplicate version_numbers. Acceptable for single-process MVP.
    Fix in future: SELECT Recipe FOR UPDATE before this query.
    """
    result = await db.execute(
        select(func.count()).where(RecipeVersion.recipe_id == recipe_id)
    )
    return result.scalar_one() + 1


async def _commit_new_version(
    db: AsyncSession,
    recipe: Recipe,
    new_version: RecipeVersion,
) -> tuple[Recipe, RecipeVersion]:
    """Point recipe at a new version, commit, and refresh both objects."""
    recipe.current_version_id = new_version.id
    recipe.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(recipe)
    await db.refresh(new_version)
    return recipe, new_version


async def create_recipe(
    db: AsyncSession,
    owner_id: uuid.UUID,
    data: RecipeCreate,
) -> tuple[Recipe, RecipeVersion]:
    """Create a new Recipe with its first RecipeVersion in a single transaction."""
    recipe = Recipe(owner_id=owner_id, visibility=data.visibility)
    db.add(recipe)
    await db.flush()

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
    )
    db.add(version)
    await db.flush()

    await _set_search_vector(db, version.id, version.title, version.description, version.ingredients)

    return await _commit_new_version(db, recipe, version)


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
    if recipe.visibility == RecipeVisibility.PRIVATE and recipe.owner_id != current_user_id:
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
            (Recipe.owner_id == current_user_id) | (Recipe.visibility == RecipeVisibility.SHARED)
        )
        .order_by(Recipe.created_at.desc(), Recipe.id.desc())
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

    query = query.limit(limit + 1)

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

    fields = _copy_version_fields(current_version)

    # Override with provided update values
    for field in _VERSION_CONTENT_FIELDS:
        value = getattr(data, field, None)
        if value is not None:
            if field in ("ingredients", "steps"):
                fields[field] = [item.model_dump() for item in value]
            elif field == "recipe_source":
                fields[field] = value.model_dump()
            else:
                fields[field] = value

    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=await _next_version_number(db, recipe_id),
        **fields,
    )
    db.add(new_version)
    await db.flush()

    await _set_search_vector(
        db, new_version.id, new_version.title, new_version.description, new_version.ingredients
    )

    if data.visibility is not None:
        recipe.visibility = data.visibility
    return await _commit_new_version(db, recipe, new_version)


async def delete_recipe(
    db: AsyncSession,
    recipe_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> None:
    """Delete a recipe and all its versions. Owner only."""
    recipe = await _get_recipe_as_owner(db, recipe_id, current_user_id)

    # Nullify current_version_id first to break the circular FK before deleting versions
    recipe.current_version_id = None
    await db.flush()

    await db.execute(delete(RecipeVersion).where(RecipeVersion.recipe_id == recipe_id))
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
    if recipe.visibility == RecipeVisibility.PRIVATE and recipe.owner_id != current_user_id:
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
    recipe = await _get_recipe_as_owner(db, recipe_id, current_user_id)

    target_result = await db.execute(
        select(RecipeVersion).where(
            RecipeVersion.id == version_id,
            RecipeVersion.recipe_id == recipe_id,
        )
    )
    target = target_result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Version not found")

    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=await _next_version_number(db, recipe_id),
        **_copy_version_fields(target),
    )
    db.add(new_version)
    await db.flush()

    await _set_search_vector(
        db, new_version.id, new_version.title, new_version.description, new_version.ingredients
    )

    return await _commit_new_version(db, recipe, new_version)
