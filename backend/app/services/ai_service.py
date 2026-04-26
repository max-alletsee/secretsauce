# backend/app/services/ai_service.py
import asyncio
import logging
import time
import uuid as _uuid
from typing import TypeVar

from google import genai
from google.genai import types

from app.core.config import settings
from app.schemas.ai_responses import MealSuggestionResult, RecipeImportResult

_T = TypeVar("_T")

logger = logging.getLogger(__name__)

_client: genai.Client | None = None

_IMPORT_PROMPT_TEMPLATE = (
    "Extract the complete recipe from this URL: {url}\n\n"
    "Return all recipe details: title, description, ingredients with quantities and units, "
    "numbered steps, servings, prep/cook/waiting times in minutes. "
    "For tags, only use values from this exact list: "
    "vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, "
    "low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, "
    "spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, "
    "italian, mexican, japanese, chinese, indian, thai, french, greek, "
    "middle-eastern, american, korean."
)

_GENERATE_PROMPT_TEMPLATE = (
    "Create a complete, detailed recipe for: {title}\n\n"
    "Return all fields including ingredients with quantities and units, numbered steps, "
    "prep/cook/waiting times in minutes, servings, a short description, and appropriate tags. "
    "For tags, only use values from this exact list: "
    "vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, "
    "low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, "
    "spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, "
    "italian, mexican, japanese, chinese, indian, thai, french, greek, "
    "middle-eastern, american, korean."
)

_IMAGE_IMPORT_PROMPT_TEMPLATE = """Extract the recipe from the provided image into structured JSON.

The image may be:
- A photograph of a cookbook page
- A handwritten recipe card
- A screenshot of a recipe website
- A partial or blurry image (do your best to extract what is visible)

Extract all visible recipe information: title, description, ingredients with quantities and units, \
numbered steps, servings, prep/cook/waiting times in minutes. \
For tags, only use values from this exact list: \
vegan, vegetarian, fish, poultry, meat, seafood, low-calorie, high-calorie, \
low-carb, high-protein, gluten-free, dairy-free, keto, paleo, mediterranean, \
spring, summer, autumn, winter, breakfast, lunch, dinner, snack, dessert, \
italian, mexican, japanese, chinese, indian, thai, french, greek, \
middle-eastern, american, korean.

If some fields are unclear or missing, omit them or use null. \
Return only the structured recipe data, nothing else."""


class AIServiceError(Exception):
    pass


async def _write_ai_log(
    db,  # AsyncSession | None
    *,
    user_id: "_uuid.UUID | None",
    call_type: str,
    model: str,
    prompt_summary: str,
    latency_ms: int,
    input_tokens: int,
    output_tokens: int,
    success: bool,
    error_message: str | None,
) -> None:
    if db is None:
        return
    from datetime import datetime, timezone
    from app.models.admin import AICallLog
    db.add(AICallLog(
        user_id=user_id,
        call_type=call_type,
        model=model,
        prompt_summary=prompt_summary[:200],
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        success=success,
        error_message=error_message,
        created_at=datetime.now(timezone.utc),
    ))
    await db.commit()


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


async def import_recipe_from_url(
    url: str,
    user_id: "_uuid.UUID | None" = None,
    db=None,  # AsyncSession | None
) -> RecipeImportResult:
    """Call Gemini with URLContext to extract a recipe from the given URL.

    Gemini fetches and reads the page itself via the url_context tool.
    Retries up to AI_MAX_RETRIES times with exponential backoff.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    prompt = _IMPORT_PROMPT_TEMPLATE.format(url=url)
    last_error: Exception | None = None
    elapsed: float = 0.0

    for attempt in range(settings.AI_MAX_RETRIES):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.AI_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(url_context=types.UrlContext())],
                        response_mime_type="application/json",
                        response_schema=RecipeImportResult,
                    ),
                ),
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            elapsed = time.monotonic() - start
            usage = response.usage_metadata
            logger.info(
                "AI import success | model=%s url=%s latency=%.2fs tokens_in=%d tokens_out=%d",
                settings.AI_MODEL,
                url,
                elapsed,
                usage.prompt_token_count if usage else 0,
                usage.candidates_token_count if usage else 0,
            )
            await _write_ai_log(
                db, user_id=user_id, call_type="url_import", model=settings.AI_MODEL,
                prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
                input_tokens=usage.prompt_token_count if usage else 0,
                output_tokens=usage.candidates_token_count if usage else 0,
                success=True, error_message=None,
            )
            return RecipeImportResult.model_validate_json(response.text)
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "AI import attempt %d/%d failed | url=%s latency=%.2fs error=%s",
                attempt + 1,
                settings.AI_MAX_RETRIES,
                url,
                elapsed,
                exc,
            )
            last_error = exc
            if attempt < settings.AI_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

    await _write_ai_log(
        db, user_id=user_id, call_type="url_import", model=settings.AI_MODEL,
        prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
        input_tokens=0, output_tokens=0,
        success=False, error_message=str(last_error),
    )
    raise AIServiceError(
        f"Import failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error


async def import_recipe_from_image(
    image_bytes: bytes,
    mime_type: str,
    user_id: "_uuid.UUID | None" = None,
    db=None,  # AsyncSession | None
) -> RecipeImportResult:
    """Call Gemini with inline image bytes to extract a recipe.

    Supports photographed cookbook pages, handwritten recipe cards,
    screenshots, and partial/blurry images.
    Retries up to AI_MAX_RETRIES times with exponential backoff.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    last_error: Exception | None = None
    elapsed: float = 0.0

    for attempt in range(settings.AI_MAX_RETRIES):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.AI_MODEL,
                    contents=[_IMAGE_IMPORT_PROMPT_TEMPLATE, image_part],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=RecipeImportResult,
                    ),
                ),
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            elapsed = time.monotonic() - start
            usage = response.usage_metadata
            logger.info(
                "AI image import success | model=%s latency=%.2fs tokens_in=%d tokens_out=%d",
                settings.AI_MODEL,
                elapsed,
                usage.prompt_token_count if usage else 0,
                usage.candidates_token_count if usage else 0,
            )
            await _write_ai_log(
                db, user_id=user_id, call_type="image_import", model=settings.AI_MODEL,
                prompt_summary="[image import]", latency_ms=int(elapsed * 1000),
                input_tokens=usage.prompt_token_count if usage else 0,
                output_tokens=usage.candidates_token_count if usage else 0,
                success=True, error_message=None,
            )
            return RecipeImportResult.model_validate_json(response.text)
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "AI image import attempt %d/%d failed | latency=%.2fs error=%s",
                attempt + 1,
                settings.AI_MAX_RETRIES,
                elapsed,
                exc,
            )
            last_error = exc
            if attempt < settings.AI_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

    await _write_ai_log(
        db, user_id=user_id, call_type="image_import", model=settings.AI_MODEL,
        prompt_summary="[image import]", latency_ms=int(elapsed * 1000),
        input_tokens=0, output_tokens=0,
        success=False, error_message=str(last_error),
    )
    raise AIServiceError(
        f"Image import failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error


async def generate_recipe_from_title(
    title: str,
    user_id: "_uuid.UUID | None" = None,
    db=None,  # AsyncSession | None
) -> RecipeImportResult:
    """Call Gemini to generate a complete recipe from a title.

    Retries up to AI_MAX_RETRIES times with exponential backoff.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    prompt = _GENERATE_PROMPT_TEMPLATE.format(title=title)
    last_error: Exception | None = None
    elapsed: float = 0.0

    for attempt in range(settings.AI_MAX_RETRIES):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.AI_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=RecipeImportResult,
                    ),
                ),
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            elapsed = time.monotonic() - start
            usage = response.usage_metadata
            logger.info(
                "AI generate success | model=%s title=%r latency=%.2fs tokens_in=%d tokens_out=%d",
                settings.AI_MODEL,
                title,
                elapsed,
                usage.prompt_token_count if usage else 0,
                usage.candidates_token_count if usage else 0,
            )
            await _write_ai_log(
                db, user_id=user_id, call_type="recipe_generate", model=settings.AI_MODEL,
                prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
                input_tokens=usage.prompt_token_count if usage else 0,
                output_tokens=usage.candidates_token_count if usage else 0,
                success=True, error_message=None,
            )
            return RecipeImportResult.model_validate_json(response.text)
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "AI generate attempt %d/%d failed | title=%r latency=%.2fs error=%s",
                attempt + 1,
                settings.AI_MAX_RETRIES,
                title,
                elapsed,
                exc,
            )
            last_error = exc
            if attempt < settings.AI_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

    await _write_ai_log(
        db, user_id=user_id, call_type="recipe_generate", model=settings.AI_MODEL,
        prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
        input_tokens=0, output_tokens=0,
        success=False, error_message=str(last_error),
    )
    raise AIServiceError(
        f"Recipe generation failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error


async def call_ai_structured(
    prompt: str,
    response_model: type[_T],
    call_type: str = "unknown",
    user_id: "_uuid.UUID | None" = None,
    db=None,  # AsyncSession | None
) -> _T:
    """General-purpose structured Gemini call for future features (meal planning etc.).

    Returns a validated instance of response_model.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    last_error: Exception | None = None
    elapsed: float = 0.0

    for attempt in range(settings.AI_MAX_RETRIES):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.AI_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=response_model,
                    ),
                ),
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            elapsed = time.monotonic() - start
            usage = response.usage_metadata
            logger.info(
                "AI structured call success | model=%s latency=%.2fs",
                settings.AI_MODEL,
                elapsed,
            )
            await _write_ai_log(
                db, user_id=user_id, call_type=call_type, model=settings.AI_MODEL,
                prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
                input_tokens=usage.prompt_token_count if usage else 0,
                output_tokens=usage.candidates_token_count if usage else 0,
                success=True, error_message=None,
            )
            return response_model.model_validate_json(response.text)
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "AI structured call attempt %d/%d failed | latency=%.2fs error=%s",
                attempt + 1,
                settings.AI_MAX_RETRIES,
                elapsed,
                exc,
            )
            last_error = exc
            if attempt < settings.AI_MAX_RETRIES - 1:
                await asyncio.sleep(2**attempt)

    await _write_ai_log(
        db, user_id=user_id, call_type=call_type, model=settings.AI_MODEL,
        prompt_summary=prompt[:200], latency_ms=int(elapsed * 1000),
        input_tokens=0, output_tokens=0,
        success=False, error_message=str(last_error),
    )
    raise AIServiceError(
        f"AI call failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error


_SUGGESTIONS_SYSTEM_PROMPT = """You are a meal planning assistant. Suggest meals based on the user's preferences.
Return a JSON object with a "suggestions" array. Each suggestion must have:
- "title": the meal name (string)
- "matched_recipe_id": UUID string if the meal matches a recipe in the user's collection, or null

IMPORTANT: For collection recipes, use the EXACT title from the provided list and include the exact recipe ID.
For new ideas not in the collection, set matched_recipe_id to null."""


def _build_suggestions_prompt(
    meal_types: list[str],
    days_ahead: int,
    dietary_restrictions: dict,
    allergies: dict,
    favorite_cuisines: list[str],
    disliked_ingredients: list[str],
    meal_plan_system_prompt: str | None,
    recipe_collection: list[tuple[str, str]],  # (id, title)
    steer_prompt: str | None,
    carryover_titles: list[str],
) -> str:
    n = len(meal_types) * days_ahead
    parts = [
        f"Plan {n} meals covering {meal_types} for {days_ahead} days.",
    ]
    if meal_plan_system_prompt:
        parts.append(f"User instructions: {meal_plan_system_prompt}")
    if dietary_restrictions:
        parts.append(f"Dietary restrictions: {dietary_restrictions}")
    if allergies:
        parts.append(f"Allergies: {allergies}")
    if favorite_cuisines:
        parts.append(f"Favorite cuisines: {', '.join(favorite_cuisines)}")
    if disliked_ingredients:
        parts.append(f"Avoid ingredients: {', '.join(disliked_ingredients)}")
    if carryover_titles:
        parts.append(
            f"The user already has these leftover/uncooked meals to use first: "
            f"{', '.join(carryover_titles)}"
        )
    if steer_prompt:
        parts.append(f"Additional context from user: {steer_prompt}")
    if recipe_collection:
        collection_str = "\n".join(f"  - {title} (id: {rid})" for rid, title in recipe_collection)
        parts.append(f"User's recipe collection:\n{collection_str}")
    parts.append(
        f"Provide exactly {n} diverse suggestions. "
        "Prefer collection recipes where they fit. "
        "Mix collection recipes with new ideas."
    )
    return "\n\n".join(parts)


async def generate_meal_suggestions(
    meal_types: list[str],
    days_ahead: int,
    dietary_restrictions: dict,
    allergies: dict,
    favorite_cuisines: list[str],
    disliked_ingredients: list[str],
    meal_plan_system_prompt: str | None,
    recipe_collection: list[tuple[str, str]],
    steer_prompt: str | None,
    carryover_titles: list[str],
    user_id: "_uuid.UUID | None" = None,
    db=None,  # AsyncSession | None
) -> MealSuggestionResult:
    """Call Gemini to generate meal suggestions. Returns validated MealSuggestionResult.

    Validates matched_recipe_id against the provided collection; nulls out unrecognised IDs.
    """
    prompt = _build_suggestions_prompt(
        meal_types=meal_types,
        days_ahead=days_ahead,
        dietary_restrictions=dietary_restrictions,
        allergies=allergies,
        favorite_cuisines=favorite_cuisines,
        disliked_ingredients=disliked_ingredients,
        meal_plan_system_prompt=meal_plan_system_prompt,
        recipe_collection=recipe_collection,
        steer_prompt=steer_prompt,
        carryover_titles=carryover_titles,
    )
    full_prompt = f"{_SUGGESTIONS_SYSTEM_PROMPT}\n\n{prompt}"
    result = await call_ai_structured(
        full_prompt, MealSuggestionResult, call_type="meal_suggestions",
        user_id=user_id, db=db,
    )

    # Validate: null out any matched_recipe_id not in the provided collection
    valid_ids = {rid for rid, _ in recipe_collection}
    for suggestion in result.suggestions:
        if suggestion.matched_recipe_id and suggestion.matched_recipe_id not in valid_ids:
            suggestion.matched_recipe_id = None

    return result
