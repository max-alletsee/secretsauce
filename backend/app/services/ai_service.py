# backend/app/services/ai_service.py
import asyncio
import logging
import time
from typing import TypeVar

from google import genai
from google.genai import types

from app.core.config import settings
from app.schemas.ai_responses import RecipeImportResult

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


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


async def import_recipe_from_url(url: str) -> RecipeImportResult:
    """Call Gemini with URLContext to extract a recipe from the given URL.

    Gemini fetches and reads the page itself via the url_context tool.
    Retries up to AI_MAX_RETRIES times with exponential backoff.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    prompt = _IMPORT_PROMPT_TEMPLATE.format(url=url)
    last_error: Exception | None = None

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

    raise AIServiceError(
        f"Import failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error


async def import_recipe_from_image(image_bytes: bytes, mime_type: str) -> RecipeImportResult:
    """Call Gemini with inline image bytes to extract a recipe.

    Supports photographed cookbook pages, handwritten recipe cards,
    screenshots, and partial/blurry images.
    Retries up to AI_MAX_RETRIES times with exponential backoff.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    last_error: Exception | None = None

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

    raise AIServiceError(
        f"Image import failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error


async def call_ai_structured(prompt: str, response_model: type[_T]) -> _T:
    """General-purpose structured Gemini call for future features (meal planning etc.).

    Returns a validated instance of response_model.
    Raises AIServiceError on permanent failure.
    """
    client = _get_client()
    last_error: Exception | None = None

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
            logger.info(
                "AI structured call success | model=%s latency=%.2fs",
                settings.AI_MODEL,
                elapsed,
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

    raise AIServiceError(
        f"AI call failed after {settings.AI_MAX_RETRIES} attempts: {last_error}"
    ) from last_error
