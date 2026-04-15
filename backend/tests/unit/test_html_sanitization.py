# backend/tests/unit/test_html_sanitization.py
"""Verify that HTML is stripped from recipe text fields on ingest."""
from app.schemas.recipe import RecipeCreate, RecipeUpdate, Ingredient, Step


def test_recipe_create_title_strips_html():
    recipe = RecipeCreate(title="<b>Bold Title</b>")
    assert recipe.title == "Bold Title"


def test_recipe_create_description_strips_html():
    recipe = RecipeCreate(title="Test", description="<p>Hello <script>alert(1)</script></p>")
    assert recipe.description == "Hello "


def test_ingredient_name_strips_html():
    recipe = RecipeCreate(
        title="Test",
        ingredients=[Ingredient(name="<em>flour</em>", quantity="200", unit="g")],
    )
    assert recipe.ingredients[0].name == "flour"


def test_step_instruction_strips_html():
    recipe = RecipeCreate(
        title="Test",
        steps=[Step(order=1, instruction="<b>Boil</b> <script>evil()</script>water")],
    )
    assert recipe.steps[0].instruction == "Boil water"


def test_recipe_update_title_strips_html():
    update = RecipeUpdate(title="<h1>New Title</h1>")
    assert update.title == "New Title"


def test_plain_text_is_unchanged():
    recipe = RecipeCreate(title="Simple Pasta")
    assert recipe.title == "Simple Pasta"
