"""create recipes tables

Revision ID: 21a00d8af3b0
Revises: ee860fc44629
Create Date: 2026-03-26 23:16:53.873769

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401 — required for sqlmodel.sql.sqltypes.AutoString used below
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '21a00d8af3b0'
down_revision: Union[str, Sequence[str], None] = 'ee860fc44629'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('recipes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_id', sa.Uuid(), nullable=False),
        sa.Column('current_version_id', sa.Uuid(), nullable=True),  # No FK here — circular ref, added below
        sa.Column('visibility', sqlmodel.sql.sqltypes.AutoString(length=10), server_default='private', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name='fk_recipes_owner_id'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recipes_owner_id', 'recipes', ['owner_id'])
    op.create_index('ix_recipes_created_at_id', 'recipes', ['created_at', 'id'])
    op.create_table('recipe_versions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('recipe_id', sa.Uuid(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('ingredients', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('steps', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('servings', sa.Integer(), nullable=False),
        sa.Column('prep_time_minutes', sa.Integer(), nullable=True),
        sa.Column('waiting_time_minutes', sa.Integer(), nullable=True),
        sa.Column('cook_time_minutes', sa.Integer(), nullable=True),
        sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('recipe_source', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['recipe_id'], ['recipes.id'], name='fk_recipe_versions_recipe_id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='fk_recipe_versions_created_by'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recipe_versions_recipe_id_version_number', 'recipe_versions', ['recipe_id', 'version_number'])
    # Deferred circular FK — must come after both tables exist
    op.create_foreign_key(
        'fk_recipes_current_version_id',
        'recipes', 'recipe_versions',
        ['current_version_id'], ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_recipes_current_version_id', 'recipes', type_='foreignkey')
    op.drop_index('ix_recipe_versions_recipe_id_version_number', table_name='recipe_versions')
    op.drop_table('recipe_versions')
    op.drop_index('ix_recipes_created_at_id', table_name='recipes')
    op.drop_index('ix_recipes_owner_id', table_name='recipes')
    op.drop_table('recipes')
