"""convert dietary_restrictions and allergies from dict to list

Revision ID: b1a2c3d4e5f6
Revises: 88e6abc70626
Create Date: 2026-06-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b1a2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "88e6abc70626"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert object values to arrays of their keys; {} -> []
    op.execute(
        """
        UPDATE users
        SET dietary_restrictions = (
            SELECT COALESCE(jsonb_agg(key), '[]'::jsonb)
            FROM jsonb_object_keys(dietary_restrictions) AS key
        )
        WHERE jsonb_typeof(dietary_restrictions) = 'object'
        """
    )
    op.execute(
        """
        UPDATE users
        SET allergies = (
            SELECT COALESCE(jsonb_agg(key), '[]'::jsonb)
            FROM jsonb_object_keys(allergies) AS key
        )
        WHERE jsonb_typeof(allergies) = 'object'
        """
    )
    op.alter_column(
        "users", "dietary_restrictions",
        server_default=sa.text("'[]'::jsonb"),
    )
    op.alter_column(
        "users", "allergies",
        server_default=sa.text("'[]'::jsonb"),
    )


def downgrade() -> None:
    # Convert arrays back into key->true maps; [] -> {}
    op.execute(
        """
        UPDATE users
        SET dietary_restrictions = (
            SELECT COALESCE(jsonb_object_agg(elem, 'true'::jsonb), '{}'::jsonb)
            FROM jsonb_array_elements_text(dietary_restrictions) AS elem
        )
        WHERE jsonb_typeof(dietary_restrictions) = 'array'
        """
    )
    op.execute(
        """
        UPDATE users
        SET allergies = (
            SELECT COALESCE(jsonb_object_agg(elem, 'true'::jsonb), '{}'::jsonb)
            FROM jsonb_array_elements_text(allergies) AS elem
        )
        WHERE jsonb_typeof(allergies) = 'array'
        """
    )
    op.alter_column(
        "users", "dietary_restrictions",
        server_default=sa.text("'{}'::jsonb"),
    )
    op.alter_column(
        "users", "allergies",
        server_default=sa.text("'{}'::jsonb"),
    )
