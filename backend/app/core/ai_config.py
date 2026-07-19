"""Per-task Gemini model selection and prompt templates.

This is the single place to review or change which Gemini model handles
each AI task, and to edit the prompt text sent for that task.
"""
from enum import Enum


class AITask(str, Enum):
    URL_IMPORT = "url_import"
    IMAGE_IMPORT = "image_import"
    RECIPE_GENERATE = "recipe_generate"
    MEAL_SUGGESTIONS = "meal_suggestions"


MODEL_PRO = "gemini-3.1-pro-preview"
MODEL_FLASH_LITE = "gemini-3.1-flash-lite"

# Fallback model for any call_type not listed in TASK_MODELS below
# (e.g. a future call_ai_structured() caller that hasn't been registered yet).
DEFAULT_MODEL = MODEL_FLASH_LITE

TASK_MODELS: dict[AITask, str] = {
    AITask.URL_IMPORT: MODEL_PRO,
    AITask.IMAGE_IMPORT: MODEL_PRO,
    AITask.RECIPE_GENERATE: MODEL_PRO,
    AITask.MEAL_SUGGESTIONS: MODEL_FLASH_LITE,
}


def get_model(call_type: str) -> str:
    """Resolve the Gemini model for a given call_type string.

    Falls back to DEFAULT_MODEL when call_type isn't a known AITask.
    """
    try:
        task = AITask(call_type)
    except ValueError:
        return DEFAULT_MODEL
    return TASK_MODELS[task]


# --- Prompt templates ---

IMPORT_PROMPT_TEMPLATE = (
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

GENERATE_PROMPT_TEMPLATE = (
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

IMAGE_IMPORT_PROMPT_TEMPLATE = """Extract the recipe from the provided image into structured JSON.

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

SUGGESTIONS_SYSTEM_PROMPT = """You are a meal planning assistant. Suggest meals based on the user's preferences.
Return a JSON object with a "suggestions" array. Each suggestion must have:
- "title": the meal name (string)
- "matched_recipe_id": UUID string if the meal matches a recipe in the user's collection, or null

IMPORTANT: For collection recipes, use the EXACT title from the provided list and include the exact recipe ID.
For new ideas not in the collection, set matched_recipe_id to null."""
