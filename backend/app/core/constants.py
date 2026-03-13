from enum import StrEnum


class RecipeVisibility(StrEnum):
    PRIVATE = "private"
    SHARED = "shared"


class MealType(StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class MealPlanStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


class MealEntrySource(StrEnum):
    AI_SUGGESTED = "ai_suggested"
    MANUAL = "manual"
    CARRYOVER = "carryover"


class CarryoverReason(StrEnum):
    NOT_COOKED = "not_cooked"
    LEFTOVER = "leftover"


class PreferredUnits(StrEnum):
    METRIC = "metric"
    IMPERIAL = "imperial"


# Pre-built tag lists (stored as strings in JSONB arrays)
PROTEIN_TAGS = ["vegan", "vegetarian", "fish", "poultry", "meat", "seafood"]
DIET_TAGS = [
    "low-calorie", "high-calorie", "low-carb", "high-protein",
    "gluten-free", "dairy-free", "keto", "paleo", "mediterranean",
]
SEASON_TAGS = ["spring", "summer", "autumn", "winter"]
MEAL_TYPE_TAGS = ["breakfast", "lunch", "dinner", "snack", "dessert"]
CUISINE_TAGS = [
    "italian", "mexican", "japanese", "chinese", "indian",
    "thai", "french", "greek", "middle-eastern", "american", "korean",
]
ALL_TAGS = PROTEIN_TAGS + DIET_TAGS + SEASON_TAGS + MEAL_TYPE_TAGS + CUISINE_TAGS
