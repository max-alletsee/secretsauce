"""phase5_meal_planning

Revision ID: a1b2c3d4e5f6
Revises: b1c2d3e4f5a6
Create Date: 2026-04-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision = "a1b2c3d4e5f6"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users: new meal plan preference columns ──────────────────────────────
    op.add_column("users", sa.Column(
        "meal_plan_meal_types", postgresql.JSONB(astext_type=sa.Text()),
        nullable=False, server_default='["dinner"]',
    ))
    op.add_column("users", sa.Column(
        "meal_plan_days_ahead", sa.Integer(), nullable=False, server_default="7",
    ))

    # ── import_tasks: task type + result payload ─────────────────────────────
    op.add_column("import_tasks", sa.Column(
        "task_type", sa.String(30), nullable=False, server_default="recipe_import",
    ))
    op.add_column("import_tasks", sa.Column(
        "result_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True,
    ))

    # ── meal_plans ────────────────────────────────────────────────────────────
    op.create_table(
        "meal_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("ai_prompt_used", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_meal_plans_user_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_plans_user_id", "meal_plans", ["user_id"])

    # ── meal_plan_entries ─────────────────────────────────────────────────────
    op.create_table(
        "meal_plan_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("meal_plan_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(20), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("entry_type", sa.String(20), nullable=False, server_default="recipe"),
        sa.Column("servings", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["meal_plan_id"], ["meal_plans.id"], name="fk_meal_plan_entries_plan_id"
        ),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipes.id"], name="fk_meal_plan_entries_recipe_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_plan_entries_meal_plan_id", "meal_plan_entries", ["meal_plan_id"])

    # ── shortlist_entries ─────────────────────────────────────────────────────
    op.create_table(
        "shortlist_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("entry_type", sa.String(20), nullable=False, server_default="recipe"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_shortlist_entries_user_id"),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipes.id"], name="fk_shortlist_entries_recipe_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shortlist_entries_user_id", "shortlist_entries", ["user_id"])

    # ── recipe_cook_logs ──────────────────────────────────────────────────────
    op.create_table(
        "recipe_cook_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("meal_plan_id", sa.Uuid(), nullable=True),
        sa.Column("cooked_at", sa.Date(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_cook_logs_user_id"),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name="fk_cook_logs_recipe_id"),
        sa.ForeignKeyConstraint(
            ["meal_plan_id"], ["meal_plans.id"], name="fk_cook_logs_meal_plan_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipe_cook_logs_user_id", "recipe_cook_logs", ["user_id"])

    # ── carryover_meals ───────────────────────────────────────────────────────
    op.create_table(
        "carryover_meals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source_meal_plan_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("original_date", sa.Date(), nullable=False),
        sa.Column("original_meal_type", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(20), nullable=False),
        sa.Column("target_meal_plan_id", sa.Uuid(), nullable=True),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_carryover_meals_user_id"
        ),
        sa.ForeignKeyConstraint(
            ["source_meal_plan_id"], ["meal_plans.id"], name="fk_carryover_source_plan_id"
        ),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipes.id"], name="fk_carryover_recipe_id"
        ),
        sa.ForeignKeyConstraint(
            ["target_meal_plan_id"], ["meal_plans.id"], name="fk_carryover_target_plan_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_carryover_meals_user_id", "carryover_meals", ["user_id"])


def downgrade() -> None:
    op.drop_table("carryover_meals")
    op.drop_table("recipe_cook_logs")
    op.drop_table("shortlist_entries")
    op.drop_table("meal_plan_entries")
    op.drop_table("meal_plans")
    op.drop_column("import_tasks", "result_data")
    op.drop_column("import_tasks", "task_type")
    op.drop_column("users", "meal_plan_days_ahead")
    op.drop_column("users", "meal_plan_meal_types")
