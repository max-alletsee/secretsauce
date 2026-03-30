"""drop created_by from recipe_versions

Revision ID: a3f7c9d21e45
Revises: 21a00d8af3b0
Create Date: 2026-03-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a3f7c9d21e45'
down_revision: Union[str, Sequence[str], None] = '21a00d8af3b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop created_by column and its FK from recipe_versions."""
    op.drop_constraint('fk_recipe_versions_created_by', 'recipe_versions', type_='foreignkey')
    op.drop_column('recipe_versions', 'created_by')


def downgrade() -> None:
    """Re-add created_by column and FK to recipe_versions."""
    op.add_column('recipe_versions', sa.Column('created_by', sa.Uuid(), nullable=False))
    op.create_foreign_key(
        'fk_recipe_versions_created_by',
        'recipe_versions', 'users',
        ['created_by'], ['id'],
    )
