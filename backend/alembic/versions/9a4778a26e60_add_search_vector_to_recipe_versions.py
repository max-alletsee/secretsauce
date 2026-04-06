"""add_search_vector_to_recipe_versions

Revision ID: 9a4778a26e60
Revises: b1c2d3e4f5a6
Create Date: 2026-04-06 21:57:34.271522

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9a4778a26e60'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "recipe_versions",
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=True),
    )
    op.create_index(
        "ix_recipe_versions_search_vector",
        "recipe_versions",
        ["search_vector"],
        postgresql_using="gin",
    )
    # Full-table backfill — may take time on large datasets. Safe for pre-production MVP.
    op.execute("""
        UPDATE recipe_versions
        SET search_vector = to_tsvector('english',
            coalesce(title, '') || ' ' ||
            coalesce(description, '') || ' ' ||
            coalesce((
                SELECT string_agg(elem->>'name', ' ')
                FROM jsonb_array_elements(ingredients) AS elem
            ), '')
        )
    """)


def downgrade() -> None:
    op.drop_index("ix_recipe_versions_search_vector", table_name="recipe_versions")
    op.drop_column("recipe_versions", "search_vector")
