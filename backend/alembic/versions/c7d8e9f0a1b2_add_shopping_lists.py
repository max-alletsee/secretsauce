"""add_shopping_lists

Revision ID: c7d8e9f0a1b2
Revises: a1b2c3d4e5f6
Create Date: 2026-04-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision = "c7d8e9f0a1b2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── shopping_lists ────────────────────────────────────────────────────────
    op.create_table(
        "shopping_lists",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("meal_plan_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_shopping_lists_user_id"
        ),
        sa.ForeignKeyConstraint(
            ["meal_plan_id"], ["meal_plans.id"], name="fk_shopping_lists_meal_plan_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shopping_lists_user_id", "shopping_lists", ["user_id"])
    op.create_unique_constraint(
        "uq_shopping_lists_meal_plan_id", "shopping_lists", ["meal_plan_id"]
    )

    # ── shopping_list_items ───────────────────────────────────────────────────
    op.create_table(
        "shopping_list_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shopping_list_id", sa.Uuid(), nullable=False),
        sa.Column("ingredient_name", sa.String(255), nullable=False),
        sa.Column("total_quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(50), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column(
            "recipe_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "checked",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["shopping_list_id"],
            ["shopping_lists.id"],
            name="fk_shopping_list_items_list_id",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_shopping_list_items_shopping_list_id",
        "shopping_list_items",
        ["shopping_list_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_shopping_list_items_shopping_list_id", table_name="shopping_list_items")
    op.drop_table("shopping_list_items")
    op.drop_constraint("uq_shopping_lists_meal_plan_id", "shopping_lists", type_="unique")
    op.drop_index("ix_shopping_lists_user_id", table_name="shopping_lists")
    op.drop_table("shopping_lists")
