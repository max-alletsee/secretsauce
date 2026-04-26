"""shopping_list_standalone

Revision ID: 88e6abc70626
Revises: f2a3b4c5d6e7
Create Date: 2026-04-26 20:34:48.549352

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '88e6abc70626'
down_revision: Union[str, Sequence[str], None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('shopping_lists', sa.Column('entry_ids', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column('shopping_lists', sa.Column('from_date', sa.Date(), nullable=True))
    op.add_column('shopping_lists', sa.Column('to_date', sa.Date(), nullable=True))
    op.alter_column('shopping_lists', 'meal_plan_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.drop_constraint('uq_shopping_lists_meal_plan_id', 'shopping_lists', type_='unique')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_unique_constraint('uq_shopping_lists_meal_plan_id', 'shopping_lists', ['meal_plan_id'])
    op.alter_column('shopping_lists', 'meal_plan_id',
               existing_type=sa.UUID(),
               nullable=False)
    op.drop_column('shopping_lists', 'to_date')
    op.drop_column('shopping_lists', 'from_date')
    op.drop_column('shopping_lists', 'entry_ids')
