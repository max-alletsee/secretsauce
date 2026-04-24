"""timeline_entries_user_id

Revision ID: e1f2a3b4c5d6
Revises: d4e5f6a7b8c9
Create Date: 2026-04-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic
revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[Sequence[str], None] = None
depends_on: Union[Sequence[str], None] = None


def upgrade() -> None:
    # Make meal_plan_id nullable on meal_plan_entries
    op.alter_column(
        "meal_plan_entries",
        "meal_plan_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )

    # Add user_id FK column to meal_plan_entries
    op.add_column(
        "meal_plan_entries",
        sa.Column("user_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_meal_plan_entries_user_id",
        "meal_plan_entries",
        "users",
        ["user_id"],
        ["id"],
    )
    op.create_index(
        "ix_meal_plan_entries_user_id",
        "meal_plan_entries",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_meal_plan_entries_user_id", table_name="meal_plan_entries")
    op.drop_constraint(
        "fk_meal_plan_entries_user_id",
        "meal_plan_entries",
        type_="foreignkey",
    )
    op.drop_column("meal_plan_entries", "user_id")

    # Restore NOT NULL on meal_plan_id
    # Note: this will fail if any rows have meal_plan_id = NULL at downgrade time
    op.alter_column(
        "meal_plan_entries",
        "meal_plan_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
